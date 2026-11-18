import PdfPreview from './PdfPreview';

type Props = { file: File; order: number[]; onOrderChange: (order: number[]) => void };
export default function PageReorder(props: Props) { return <PdfPreview {...props}/>; }
