-- Text of every PDF page, for searching inside PDFs. The trigram tokenizer finds parts of words
-- ("kontrolle" in "Staukontrolle"), ignoring case and accents.
CREATE VIRTUAL TABLE pdf_text_fts USING fts5(
  document_id UNINDEXED,
  page_number UNINDEXED,
  text,
  tokenize = 'trigram remove_diacritics 1'
);

-- Which version of the text extraction a document was indexed with (NULL = not yet).
ALTER TABLE documents ADD COLUMN text_indexed INTEGER;

CREATE TRIGGER documents_text_delete AFTER DELETE ON documents BEGIN
  DELETE FROM pdf_text_fts WHERE document_id = old.id;
END;
