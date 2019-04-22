let uuid, Service, Characteristic, StreamController;

let ip = require('ip');
let spawn = require('child_process').spawn;
let URL = require('url');
let crypto = require('crypto');

const FFMPEG = function (hap, cameraName, feedSupplier, log) {
    this.log = log;
    this.cameraName = cameraName;
    this.feedSupplier = feedSupplier;

    uuid = hap.uuid;
    Service = hap.Service;
    Characteristic = hap.Characteristic;
    StreamController = hap.StreamController;

    this.services = [];
    this.streamControllers = [];
    this.pendingSessions = {};
    this.ongoingSessions = {};

    let numberOfStreams = 2;

    let options = {
        proxy: false, // Requires RTP/RTCP MUX Proxy
        srtp: true, // Supports SRTP AES_CM_128_HMAC_SHA1_80 encryption
        video: {
            resolutions: [
                //[1920, 1080, 30], // Width, Height, framerate
                //[1280, 960, 30],
                //[1280, 720, 30],
                [1024, 768, 25],
                [640, 480, 25],
                [640, 360, 25],
                [480, 360, 25],
                [480, 270, 25],
                [320, 240, 25],
                [320, 240, 15],
                [320, 180, 25],
                [320, 180, 15],
                [320, 240, 25],
                [320, 240, 15] // Apple Watch requires this configuration
            ],
            codec: {
                profiles: [0, 1, 2], // Enum, please refer StreamController.VideoCodecParamProfileIDTypes
                levels: [0, 1, 2] // Enum, please refer StreamController.VideoCodecParamLevelTypes
            }
        },
        audio: {
            codecs: [
                {
                    type: "OPUS", // Audio Codec
                    samplerate: 24 // 8, 16, 24 KHz
                },
                {
                    type: "AAC-eld",
                    samplerate: 16
                }
            ]
        }
    };

    this.createCameraControlService();
    this._createStreamControllers(numberOfStreams, options);
};

FFMPEG.prototype = {
    getSnapshotSource() {
        return "-i " + this.getCameraFeed() + "/picture";
    },

    getVideoSource() {
        return "-rtsp_transport tcp -vcodec h264_mmal -re -i " + this.getCameraFeed();
    },

    getCameraFeed() {
        this.feedSupplier()
            .then(sessionInfo => {
                this.log.debug('Got sessionInfo=', sessionInfo);

                let feed = sessionInfo.session.streamRtspUrl;

                if (!feed) {
                    throw new Error("Missing source for camera: " + this.cameraName);
                }

                let rtspFeed = feed.replace('%26', '&');

                this.log.debug('Feed URL', rtspFeed);

                return rtspFeed;
            });
    },

    handleCloseConnection(connectionID) {
        this.streamControllers.forEach(function (controller) {
            controller.handleCloseConnection(connectionID);
        });
    },

    handleSnapshotRequest(request, callback) {
        this.log.debug("Snapshot request, camera=%s", this.cameraName);

        let resolution = request.width + 'x' + request.height;
        let imageSource = this.getSnapshotSource();
        let ffmpeg = spawn('ffmpeg', (imageSource + ' -t 1 -s ' + resolution + ' -f image2 -').split(' '), {env: process.env});
        let imageBuffer = new Buffer(0);

        this.log.debug("Snapshot", imageSource + ' -t 1 -s ' + resolution + ' -f image2 -');

        ffmpeg.stdout.on('data', function (data) {
            imageBuffer = Buffer.concat([imageBuffer, data]);
        });

        ffmpeg.on('close', function (code) {
            callback(undefined, imageBuffer);
        }.bind(this));

        ffmpeg.on('error', function (error) {
            this.log("An error occurred while making snapshot request");
            this.log.debug(error);
        }.bind(this));
    },

    prepareStream(request, callback) {
        let sessionInfo = {};

        let sessionID = request["sessionID"];
        sessionInfo["address"] = request["targetAddress"];

        let response = {};

        let videoInfo = request["video"];
        if (videoInfo) {
            let targetPort = videoInfo["port"];
            let srtp_key = videoInfo["srtp_key"];
            let srtp_salt = videoInfo["srtp_salt"];

            // SSRC is a 32 bit integer that is unique per stream
            let ssrcSource = crypto.randomBytes(4);
            ssrcSource[0] = 0;

            let ssrc = ssrcSource.readInt32BE(0, true);

            response["video"] = {
                port: targetPort,
                ssrc: ssrc,
                srtp_key: srtp_key,
                srtp_salt: srtp_salt
            };

            sessionInfo["video_port"] = targetPort;
            sessionInfo["video_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
            sessionInfo["video_ssrc"] = ssrc;
        }

        let audioInfo = request["audio"];
        if (audioInfo) {
            let targetPort = audioInfo["port"];
            let srtp_key = audioInfo["srtp_key"];
            let srtp_salt = audioInfo["srtp_salt"];

            // SSRC is a 32 bit integer that is unique per stream
            let ssrcSource = crypto.randomBytes(4);
            ssrcSource[0] = 0;

            let ssrc = ssrcSource.readInt32BE(0, true);

            response["audio"] = {
                port: targetPort,
                ssrc: ssrc,
                srtp_key: srtp_key,
                srtp_salt: srtp_salt
            };

            sessionInfo["audio_port"] = targetPort;
            sessionInfo["audio_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
            sessionInfo["audio_ssrc"] = ssrc;
        }

        let currentAddress = ip.address();

        let addressResp = {
            address: currentAddress
        };

        if (ip.isV4Format(currentAddress)) {
            addressResp["type"] = "v4";
        } else {
            addressResp["type"] = "v6";
        }

        response["address"] = addressResp;
        this.pendingSessions[uuid.unparse(sessionID)] = sessionInfo;

        callback(response);
    },

    handleStreamRequest(request) {
        let sessionID = request["sessionID"];
        let requestType = request["type"];
        if (sessionID) {
            let sessionIdentifier = uuid.unparse(sessionID);

            if (requestType == "start") {
                this.log("Live stream requested, camera=%s", this.cameraName);

                let sessionInfo = this.pendingSessions[sessionIdentifier];

                if (sessionInfo) {
                    let width = 1280;
                    let height = 720;
                    let fps = 10;
                    let videoBitrate = 200;
                    let videoCodec = 'h264_omx';
                    let audioCodec = 'libfdk_aac';
                    let audioBitrate = 32;
                    let audioSampleRate = 16;
                    let packetSize = 188;

                    let videoInfo = request["video"];

                    if (videoInfo) {
                        width = videoInfo["width"];
                        height = videoInfo["height"];

                        let expectedFPS = videoInfo["fps"];

                        if (expectedFPS < fps) {
                            fps = expectedFPS;
                        }

                        videoBitrate = videoInfo["max_bit_rate"];
                    }

                    let audioInfo = request["audio"];

                    if (audioInfo) {
                        audioBitrate = audioInfo["max_bit_rate"];
                        audioSampleRate = audioInfo["sample_rate"];
                    }

                    let targetAddress = sessionInfo["address"];
                    let targetVideoPort = sessionInfo["video_port"];
                    let videoKey = sessionInfo["video_srtp"];
                    let videoSsrc = sessionInfo["video_ssrc"];

                    let ffmpegCommand = this.getVideoSource() +
                        ' -map 0:0' +
                        //' -threads 0' +
                        ' -vcodec ' + videoCodec +
                        // ' -an' +
                        ' -pix_fmt yuv420p' +
                        ' -r ' + fps +
                        ' -f rawvideo' +
                        ' -tune zerolatency' +
                        ' -vf scale=' + width + ':' + height +
                        ' -b:v ' + videoBitrate + 'k' +
                        ' -bufsize ' + videoBitrate + 'k' +
                        ' -maxrate ' + videoBitrate + 'k' +
                        ' -payload_type 99' +
                        ' -ssrc ' + videoSsrc +
                        ' -f rtp' +
                        ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
                        ' -srtp_out_params ' + videoKey.toString('base64') +
                        ' srtp://' + targetAddress + ':' + targetVideoPort + '?rtcpport=' + targetVideoPort + '&localrtcpport=' + targetVideoPort + '&pkt_size=' + packetSize;

                    this.log.debug(ffmpegCommand);

                    let ffmpegSession = spawn('ffmpeg', ffmpegCommand.split(' '), {env: process.env});
                    let that = this;

                    ffmpegSession.stderr.on('data', function (data) {
                        that.log.debug(data.toString());
                    });

                    ffmpegSession.on('error', function (error) {
                        that.log.error("An error occurred while requesting the stream");
                    });

                    ffmpegSession.on('close', function (code) {
                        if (code == null || code === 0 || code === 255) {
                            that.log.debug("Stream successfully closed");
                        } else {
                            that.log.error("Stream closed with errorCode=%s", code);
                            that.streamControllers
                                .filter(controller => controller.sessionIdentifier === sessionIdentifier)
                                .forEach(controller => controller.forceStop());
                        }
                    });

                    this.ongoingSessions[sessionIdentifier] = ffmpegSession;
                }

                delete this.pendingSessions[sessionIdentifier];
            } else if (requestType == "stop") {
                let ffmpegProcess = this.ongoingSessions[sessionIdentifier];

                if (ffmpegProcess) {
                    ffmpegProcess.kill('SIGTERM');
                }

                delete this.ongoingSessions[sessionIdentifier];

                this.log("Live stream stopped, camera=%s", this.cameraName);
            }
        }
    },

    createCameraControlService() {
        this.services.push(new Service.CameraControl());
    },

    // Private
    _createStreamControllers(maxStreams, options) {
        for (let i = 0; i < maxStreams; i++) {
            let streamController = new StreamController(i, options, this);

            this.services.push(streamController.service);
            this.streamControllers.push(streamController);
        }
    }
};

module.exports = {
    FFMPEG
};
