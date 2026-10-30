export type FileTool = 'merge' | 'rotate' | 'extract' | 'split' | 'delete' | 'reorder' | 'images';

type FileDescriptor = Pick<File, 'type' | 'name'>;

const isPdf = (file: FileDescriptor): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const isImage = (file: FileDescriptor): boolean =>
  file.type === 'image/png' || file.type === 'image/jpeg' || /\.(png|jpe?g)$/i.test(file.name);

export function validateFilesForTool(tool: FileTool, files: FileDescriptor[]): string | null {
  if (tool === 'images' && files.some((file) => !isImage(file))) {
    return 'Images to PDF accepts only PNG and JPG/JPEG files. Remove any PDFs and try again.';
  }

  if (tool !== 'images' && files.some((file) => !isPdf(file))) {
    return 'This tool accepts PDF files only. Remove any images and try again.';
  }

  return null;
}


const readSignatureBytes = async (file: File): Promise<Uint8Array> =>
  new Uint8Array(await file.slice(0, 1024).arrayBuffer());

export async function validateFileSignatures(files: File[]): Promise<string | null> {
  for (const file of files) {
    const bytes = await readSignatureBytes(file);
    const isPdf = file.type === 'application/pdf' || /\\.pdf$/i.test(file.name);
    const isPng = file.type === 'image/png' || /\\.png$/i.test(file.name);
    const isJpeg = file.type === 'image/jpeg' || /\\.jpe?g$/i.test(file.name);
    const hasPdfSignature = new TextDecoder().decode(bytes).includes('%PDF-');
    const hasPngSignature = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const hasJpegSignature = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    if ((isPdf && !hasPdfSignature) || (isPng && !hasPngSignature) || (isJpeg && !hasJpegSignature)) {
      return 'The file content does not match its PDF, PNG, or JPEG type. Choose a genuine supported file.';
    }
  }
  return null;
}
