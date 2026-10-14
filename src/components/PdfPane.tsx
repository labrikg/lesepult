import { FileUp } from "lucide-react";

/** Placeholder until PDF import + PDF.js rendering land. */
export function PdfPane() {
  return (
    <section className="pdf-pane" aria-label="PDF viewer">
      <div className="pane-toolbar">
        <span className="mono">No PDF attached</span>
      </div>
      <div className="pdf-empty">
        <div className="empty-card">
          <FileUp size={28} strokeWidth={1.6} aria-hidden="true" />
          <h2>Attach lecture slides</h2>
          <p>PDFs you attach here open next to your note, ready to highlight and snip.</p>
          <button type="button" className="btn btn--primary" disabled title="Arrives with the PDF viewer">
            Attach PDF
          </button>
        </div>
      </div>
    </section>
  );
}
