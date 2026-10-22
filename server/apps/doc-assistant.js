'use strict';

const { S } = require('../schema');
const { sum } = require('../lib/util');

const FILE_TYPES = ['PDF', 'TXT', 'MD', 'MARKDOWN', 'CSV', 'JSON'];
const MAX_CHARS_PER_DOCUMENT = 8000000;

const passage = S.record({
  id: S.text(1, 80),
  page: S.integer(0, 10000),
  text: S.text(1, 20000),
});

const document = S.record({
  id: S.id,
  name: S.text(1, 200),
  ext: S.enum(FILE_TYPES),
  size: S.integer(0, 26000000),
  uploadedAt: S.datetime,
  pageLabel: S.enum(['Page', 'Section']),
  pageCount: S.integer(0, 10000),
  wordCount: S.integer(0, 10000000),
  chunks: S.list(passage, 20000),
});

module.exports = {
  key: 'doc-assistant',
  name: 'DocPilot',
  description: 'Document library for the AI document assistant: extracted text, passages and usage statistics.',
  schema: {
    collections: {
      documents: S.list(document, 200),
    },
    settings: {},
  },

  invariants(doc) {
    const problems = [];
    doc.documents.forEach((d, i) => {
      const chars = sum(d.chunks.map((c) => c.text.length));
      if (chars > MAX_CHARS_PER_DOCUMENT) {
        problems.push({ path: `documents[${i}].chunks`, message: `holds ${chars} characters; the limit is ${MAX_CHARS_PER_DOCUMENT}` });
      }
    });
    return problems;
  },

  summary(doc, now) {
    const passages = sum(doc.documents.map((d) => d.chunks.length));
    const bytes = sum(doc.documents.map((d) => d.size));
    return {
      asOf: now.toISOString().slice(0, 10),
      documents: doc.documents.length,
      pages: sum(doc.documents.map((d) => d.pageCount)),
      passages,
      words: sum(doc.documents.map((d) => d.wordCount)),
      uploadedBytes: bytes,
    };
  },
};
