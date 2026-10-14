import { FileUp } from "lucide-react";
import { useStore } from "../store";
import { PdfViewer } from "../pdf/PdfViewer";

export function PdfPane() {
  const pdf = useStore((s) => s.pdf);
  const attachPdf = useStore((s) => s.attachPdf);
  const removePdf = useStore((s) => s.removePdf);
  const renamePdf = useStore((s) => s.renamePdf);
  const showPagePdf = useStore((s) => s.showPagePdf);
  const pageDocId = useStore((s) => s.page?.documentId ?? null);

  if (pdf)
    return (
      <PdfViewer
        key={pdf.id}
        doc={pdf}
        onReplace={attachPdf}
        onRemove={removePdf}
        onRename={renamePdf}
        isPageDoc={pdf.id === pageDocId}
        onShowPagePdf={showPagePdf}
      />
    );

  return (
    <section className="pdf-pane" aria-label="PDF viewer">
      <div className="pane-toolbar">
        <span className="mono">No PDF attached</span>
      </div>
      <div className="pdf-empty">
        <div className="empty-card">
          <FileUp size={28} strokeWidth={1.6} aria-hidden="true" />
          <h2>Attach lecture slides</h2>
          <p>
            The PDF opens next to your note. It's copied into Lesepult, so moving the original won't break
            anything.
          </p>
          <button type="button" className="btn btn--primary" onClick={attachPdf}>
            Attach PDF
          </button>
        </div>
      </div>
    </section>
  );
}
