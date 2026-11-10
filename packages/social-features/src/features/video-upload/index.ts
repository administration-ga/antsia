/**
 * video-upload — préparer une vidéo avant l'envoi, pour une Story ou une
 * publication (lot SD-03) : lisible partout (MP4 ou WebM), bornée (poids et
 * durée du domaine), convertie dans le navigateur quand il sait la lire.
 *
 * Les décisions (bornes, cibles, refus, phrases) dans `video-upload-policy.ts` ;
 * le câblage DOM dans `video-upload-probe.ts` ; l'enchaînement, testable sans
 * navigateur, dans `video-preparation.ts`.
 */
export {
	isDirectUploadVideoType,
	isVideoCandidateType,
	mp4CodecsRequireTranscode,
	MP4_UNIVERSAL_VIDEO_CODECS,
	POST_VIDEO_UPLOAD_LIMITS,
	STORY_VIDEO_UPLOAD_LIMITS,
	transcodeVideoBitrate,
	VIDEO_TRANSCODE_MAX_DURATION_MS,
	VIDEO_TRANSCODE_TARGETS,
	VIDEO_UPLOAD_ACCEPT,
	videoDurationLabel,
	videoUploadPlan,
	type VideoUploadLimits,
	type VideoUploadPlan,
	type VideoUploadProbe,
} from "./video-upload-policy"
export {
	isTranscodeAborted,
	probeVideoFile,
	sniffFileMp4VideoCodecs,
	transcodeVideo,
	TRANSCODE_ABORTED,
	type TranscodeOptions,
	type TranscodeResult,
} from "./video-upload-probe"
export {
	browserVideoRuntime,
	convertedVideoName,
	measuredVideoDuration,
	prepareVideoForUpload,
	rememberVideoDuration,
	type PrepareVideo,
	type PrepareVideoOptions,
	type VideoPreparation,
	type VideoPreparationPhase,
	type VideoRuntime,
} from "./video-preparation"
