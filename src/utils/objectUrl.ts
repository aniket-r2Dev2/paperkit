export function revokeObjectUrls(urls: string[]): void {
  for (const url of new Set(urls)) {
    URL.revokeObjectURL(url);
  }
}
