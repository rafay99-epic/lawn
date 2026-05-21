export const GIBIBYTE = 1024 ** 3;
export const MEBIBYTE = 1024 ** 2;

export const MAX_VIDEO_FILE_SIZE_BYTES = 30 * GIBIBYTE;
export const SINGLE_PUT_MAX_BYTES = 5 * GIBIBYTE;
export const MULTIPART_PART_SIZE_BYTES = 64 * MEBIBYTE;
export const MULTIPART_UPLOAD_CONCURRENCY = 4;
export const MAX_SIGN_PARTS_BATCH = 20;

export function formatMaxUploadSize() {
  return "30 GB";
}

export function isFileTooLarge(fileSize: number) {
  return fileSize > MAX_VIDEO_FILE_SIZE_BYTES;
}

export function buildFileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
