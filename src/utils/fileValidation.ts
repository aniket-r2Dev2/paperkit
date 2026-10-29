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
