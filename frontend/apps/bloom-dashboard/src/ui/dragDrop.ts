const BLOOM_DRAG_PREFIX = "application/x-bloom";

export const BLOOM_SCREEN_DRAG_TYPE = `${BLOOM_DRAG_PREFIX}-screen-id`;

export function canReceiveBloomDrag(dataTransfer: DataTransfer, dragType: string): boolean {
  return Array.from(dataTransfer.types).includes(dragType);
}

export function readBloomDragPayload(dataTransfer: DataTransfer, dragType: string): string {
  return dataTransfer.getData(dragType).trim();
}

export function writeBloomDragPayload(dataTransfer: DataTransfer, dragType: string, payload: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(dragType, payload);
}
