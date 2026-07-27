"use client";

type ConvertImageOptions = {
  maxSizeKB?: number;
  maxWidthOrHeight?: number;
  maxOriginalSizeMB?: number;
  quality?: number;
};

const DEFAULT_MAX_SIZE_KB = 450;
const DEFAULT_MAX_WIDTH_OR_HEIGHT = 800;
const DEFAULT_MAX_ORIGINAL_SIZE_MB = 8;
const DEFAULT_QUALITY = 0.82;

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

function validateImageFile(file: File, maxOriginalSizeMB: number) {
  if (!file) {
    throw new Error("No image file selected.");
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Only JPG, PNG, and WEBP image files are allowed.");
  }

  const fileSizeMB = file.size / 1024 / 1024;

  if (fileSizeMB > maxOriginalSizeMB) {
    throw new Error(
      `Image is too large. Maximum allowed size is ${maxOriginalSizeMB}MB.`
    );
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read image file."));
    };

    reader.onerror = () => {
      reject(new Error("Unable to read image file."));
    };

    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load selected image."));

    image.src = src;
  });
}

function calculateSize(
  width: number,
  height: number,
  maxWidthOrHeight: number
) {
  if (width <= maxWidthOrHeight && height <= maxWidthOrHeight) {
    return { width, height };
  }

  const ratio = Math.min(maxWidthOrHeight / width, maxWidthOrHeight / height);

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function canvasToDataUrl(
  image: HTMLImageElement,
  width: number,
  height: number,
  quality: number
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to process image.");
  }

  canvas.width = width;
  canvas.height = height;

  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

export function isBase64Image(value?: string | null) {
  if (!value) {
    return false;
  }

  return /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);
}

export function getBase64SizeKB(base64: string) {
  const base64Data = base64.split(",")[1] || base64;
  const padding = (base64Data.match(/=/g) || []).length;
  const sizeInBytes = (base64Data.length * 3) / 4 - padding;

  return Math.round(sizeInBytes / 1024);
}

export async function convertImageToBase64(
  file: File,
  options: ConvertImageOptions = {}
) {
  const {
    maxSizeKB = DEFAULT_MAX_SIZE_KB,
    maxWidthOrHeight = DEFAULT_MAX_WIDTH_OR_HEIGHT,
    maxOriginalSizeMB = DEFAULT_MAX_ORIGINAL_SIZE_MB,
    quality = DEFAULT_QUALITY,
  } = options;

  validateImageFile(file, maxOriginalSizeMB);

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const resized = calculateSize(
    image.width,
    image.height,
    maxWidthOrHeight
  );

  let currentQuality = quality;
  let base64Image = canvasToDataUrl(
    image,
    resized.width,
    resized.height,
    currentQuality
  );

  while (getBase64SizeKB(base64Image) > maxSizeKB && currentQuality > 0.35) {
    currentQuality -= 0.08;

    base64Image = canvasToDataUrl(
      image,
      resized.width,
      resized.height,
      currentQuality
    );
  }

  if (!isBase64Image(base64Image)) {
    throw new Error("Invalid image format after conversion.");
  }

  return base64Image;
}