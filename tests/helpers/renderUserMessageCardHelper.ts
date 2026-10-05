import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UserMessageCard from '../../components/UserMessageCard';

const mode = process.argv[2] || 'image';

if (mode === 'image') {
  const html = renderToStaticMarkup(
    React.createElement(UserMessageCard, {
      content: 'Check out this screenshot\n📎 Uploaded a file: sample.png',
      sessionId: 'test-session-files-123',
      files: [{ name: 'sample.png', serverFilename: '1728000000000_sample.png', size: 1024, mimeType: 'image/png' }],
    })
  );
  console.log(JSON.stringify({
    hasUserText: html.includes('Check out this screenshot'),
    noRawClip: !html.includes('user-message-card-content">Check out this screenshot\n📎 Uploaded a file:'),
    hasImg: html.includes('<img') && html.includes('user-message-image-preview'),
    imgSrcCorrect: html.includes('/api/sessions/test-session-files-123/files/1728000000000_sample.png'),
    hasDownloadBtn: html.includes('user-message-download-btn'),
    downloadAttr: html.includes('download="sample.png"'),
    downloadParam: html.includes('download=1'),
  }));
} else if (mode === 'parsed') {
  const html = renderToStaticMarkup(
    React.createElement(UserMessageCard, {
      content: '📎 Uploaded a file: sample.png',
      sessionId: 'test-session-files-123',
    })
  );
  console.log(JSON.stringify({
    hasImg: html.includes('<img') && html.includes('/api/sessions/test-session-files-123/files/sample.png'),
    downloadAttr: html.includes('download="sample.png"'),
  }));
} else if (mode === 'doc') {
  const html = renderToStaticMarkup(
    React.createElement(UserMessageCard, {
      content: 'Please inspect the report\n📎 Uploaded a file: document.pdf',
      sessionId: 'test-session-files-123',
      files: [{ name: 'document.pdf', serverFilename: '1728000000100_document.pdf', size: 2048, mimeType: 'application/pdf' }],
    })
  );
  console.log(JSON.stringify({
    hasNoImg: !html.includes('<img'),
    hasFileName: html.includes('document.pdf'),
    hasFileSize: html.includes('2.0 KB'),
    hasDownloadBtn: html.includes('user-message-download-btn'),
    downloadAttr: html.includes('download="document.pdf"'),
    downloadUrlCorrect: html.includes('/api/sessions/test-session-files-123/files/1728000000100_document.pdf?download=1'),
  }));
}
