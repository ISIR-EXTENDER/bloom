const BLOOM_DRAG_PREFIX = "application/x-bloom";

export const BLOOM_SCREEN_DRAG_TYPE = `${BLOOM_DRAG_PREFIX}-screen-id`;
export const BLOOM_APP_SCREEN_REORDER_DRAG_TYPE = `${BLOOM_DRAG_PREFIX}-app-screen-reorder-id`;

export function canReceiveBloomDrag(dataTransfer: DataTransfer, dragType: string | readonly string[]): boolean {
  const acceptedTypes = Array.isArray(dragType) ? dragType : [dragType];
  return Array.from(dataTransfer.types).some((candidateType) => acceptedTypes.includes(candidateType));
}

export function readBloomDragPayload(dataTransfer: DataTransfer, dragType: string): string {
  return dataTransfer.getData(dragType).trim();
}

export function writeBloomDragPayload(dataTransfer: DataTransfer, dragType: string, payload: string): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(dragType, payload);
}
