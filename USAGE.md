# Usage

## Install

```bash
npm install easy-email-builder
```

## Basic

```tsx
import { EmailBuilder } from 'easy-email-builder';

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <EmailBuilder />
    </div>
  );
}
```

## With an initial document

```tsx
import { EmailBuilder, TEditorConfiguration } from 'easy-email-builder';

function App() {
  const initialDocument: TEditorConfiguration = {
    root: {
      type: 'EmailLayout',
      data: {
        backdropColor: '#F5F5F5',
        canvasColor: '#FFFFFF',
        textColor: '#262626',
        fontFamily: 'MODERN_SANS',
        childrenIds: [],
      },
    },
  };

  return <EmailBuilder initialDocument={initialDocument} />;
}
```

## Listen for changes

```tsx
import { EmailBuilder, TEditorConfiguration } from 'easy-email-builder';

function App() {
  const handleChange = (document: TEditorConfiguration, html: string) => {
    // Save to your server
    fetch('/api/save-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document, html }),
    });
  };

  return <EmailBuilder onChange={handleChange} />;
}
```

## Image upload

```tsx
import { EmailBuilder } from 'easy-email-builder';

function App() {
  const handleImageUpload = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    const data = await response.json();
    return data.url;
  };

  return <EmailBuilder imageUploadHandler={handleImageUpload} />;
}
```

## Read the current document

```tsx
import { useDocument } from 'easy-email-builder';

function ExportButton() {
  const document = useDocument();
  return <button onClick={() => console.log(document)}>Export</button>;
}
```

## Types

```tsx
import type { EmailBuilderProps, TEditorConfiguration, TEditorBlock } from 'easy-email-builder';
```
