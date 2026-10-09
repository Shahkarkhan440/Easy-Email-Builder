import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';

import {
  DataObjectOutlined,
  TitleOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  Code as CodeIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { Box, SpeedDial, SpeedDialAction, SpeedDialIcon, Button } from '@mui/material';

import EmailBuilder, { EmailBuilderRef, EmailBuilderVariableInput } from '../src/EmailBuilder';
import HtmlEditor from '../src/HtmlEditor';
import { TEditorConfiguration } from '../src/documents/editor/core';
import { decodeTemplateHash } from '../src/getConfiguration';

const testJSON = {
  "root": {
    "type": "EmailLayout",
    "data": {
      "backdropColor": "#F5F5F5",
      "canvasColor": "#FFFFFF",
      "textColor": "#262626",
      "fontFamily": "MODERN_SANS",
      "childrenIds": [
        "block-1767940150149-2",
        "block-1767940151420-3",
        "block-1767940152389-4",
        "block-1767940178344-1",
        "block-1767940190319-3",
        "block-1767940154214-5",
        "block-1767940184342-2"
      ]
    }
  },
  "block-1767940150149-2": {
    "type": "Heading",
    "data": {
      "props": {
        "text": "My new heading block"
      },
      "style": {
        "padding": {
          "top": 16,
          "bottom": 16,
          "left": 24,
          "right": 24
        }
      }
    }
  },
  "block-1767940151420-3": {
    "type": "Text",
    "data": {
      "props": {
        "markdown": false,
        "message": "My new text block {{first_name}} {{first_name}} {%send_weekday%}",
        "variables": [
          { "attribute": "first_name", "variable": "{{first_name}}", "default": "John", "type": "user" },
          { "attribute": "first_name", "variable": "{{first_name}}", "type": "user" },
          { "attribute": "send_weekday", "variable": "{%send_weekday%}", "type": "system" },
        ]
      },
      "style": {
        "padding": {
          "top": 16,
          "bottom": 16,
          "left": 24,
          "right": 24
        },
        "fontWeight": "normal"
      }
    }
  },
  "block-1767940152389-4": {
    "type": "Text",
    "data": {
      "props": {
        "text": "My new text block {{email}}",
        "markdown": false
      },
      "style": {
        "padding": {
          "top": 16,
          "bottom": 16,
          "left": 24,
          "right": 24
        },
        "fontWeight": "normal"
      }
    }
  },
  "block-1767940154214-5": {
    "type": "Button",
    "data": {
      "style": {
        "backgroundColor": "#ede7e7",
        "textAlign": "center",
        "padding": {
          "top": 16,
          "bottom": 16,
          "right": 24,
          "left": 24
        }
      },
      "props": {
        "buttonBackgroundColor": "#1148ef",
        "buttonStyle": "rectangle",
        "fullWidth": true,
        "text": "Button",
        "url": ""
      }
    }
  },
  "block-1767940178344-1": {
    "type": "Image",
    "data": {
      "props": {
        "url": "",
        "alt": "Sample product",
        "contentAlignment": "middle",
        "linkHref": null
      },
      "style": {
        "padding": {
          "top": 16,
          "bottom": 16,
          "left": 24,
          "right": 24
        }
      }
    }
  },
  "block-1767940184342-2": {
    "type": "Socials",
    "data": {
      "props": {
        "platforms": [
          "facebook",
          "instagram",
          "x"
        ],
        "iconStyle": "origin-colorful",
        "iconSize": 36,
        "socials": [
          {
            "platform": "facebook",
            "url": null
          },
          {
            "platform": "instagram",
            "url": null
          },
          {
            "platform": "x",
            "url": null
          }
        ]
      },
      "style": {
        "padding": {
          "top": 16,
          "bottom": 16,
          "right": 24,
          "left": 24
        },
        "backgroundColor": "#ede7e7"
      }
    }
  },
  "block-1767940190319-3": {
    "type": "Divider",
    "data": {
      "style": {
        "padding": {
          "top": 16,
          "bottom": 0,
          "right": 0,
          "left": 0
        }
      },
      "props": {
        "lineColor": "#CCCCCC"
      }
    }
  }
};

// Example image upload handler
// Replace this with your own upload logic
// e.g. upload to cloud storage (AWS S3, etc.) or your backend API
async function exampleImageUploadHandler(file: File): Promise<string> {
  // Example 1: convert to base64 with FileReader (demo only; upload to a server in production)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      resolve(base64Url);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Example 2: upload to a backend API (uncomment and implement)
  // const formData = new FormData();
  // formData.append('image', file);
  // const response = await fetch('/api/upload', {
  //   method: 'POST',
  //   body: formData,
  // });
  // const data = await response.json();
  // return data.url;
}

async function exampleVideoUploadHandler(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Url = reader.result as string;
      resolve(base64Url);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const Home = () => {
  const [showJsonFeatures, setShowJsonFeatures] = useState(true);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [showSamplesDrawerTitle, setShowSamplesDrawerTitle] = useState(true);
  const [initialDocument, setInitialDocument] = useState<TEditorConfiguration | undefined>(undefined);
  const [editorMode, setEditorMode] = useState<'email' | 'html'>('email');
  const [htmlCode, setHtmlCode] = useState('<p>Hello World</p>\n<h1>HTML Editor Test</h1>\n<p>This is an HTML editor test</p>');
  const [variables, setVariables] = useState<EmailBuilderVariableInput[]>([]);

  const emailBuilderRef = useRef<EmailBuilderRef>(null);

  // Open a template shared by link (#z/… from the MCP server's preview links, or #code/… from the Share button)
  useEffect(() => {
    decodeTemplateHash(window.location.hash).then((doc) => {
      if (doc) setInitialDocument(doc as TEditorConfiguration);
    });
  }, []);

  const handleToggleJsonFeatures = () => {
    setShowJsonFeatures((prev) => !prev);
  };

  const handleToggleSamplesDrawerTitle = () => {
    setShowSamplesDrawerTitle((prev) => !prev);
  };

  const handleLoadTestJSON = () => {
    // Deep-clone testJSON so React sees a new object reference
    setInitialDocument(JSON.parse(JSON.stringify(testJSON)) as TEditorConfiguration);
    setVariables([
      {
        id: 1,
        variable: '{{first_name}}',
        attribute: 'first_name',
        default: 'John',
      },
      {
        id: 2,
        variable: '{{first_name}}',
        attribute: 'first_name',
        default: 'friend',
      },
    ]);
  };

  const handleToggleEditorMode = () => {
    setEditorMode((prev) => (prev === 'email' ? 'html' : 'email'));
  };

  const handleSave = () => {
    emailBuilderRef.current?.getData((json, html) => {
      console.log('JSON:', json);
      console.log('HTML:', html);
    });
    emailBuilderRef.current?.getVariables((vars) => {
      console.log('Variables:', vars);
    });
  };

  return (
    <React.StrictMode>
      <Box sx={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
        {editorMode === 'email' ? (
          <EmailBuilder
            ref={emailBuilderRef}
            initialDocument={initialDocument}
            showJsonFeatures={showJsonFeatures}
            showSamplesDrawerTitle={showSamplesDrawerTitle}
            variables={variables}
            contactAttributes={[
              {
                Id: 7,
                IsSystem: 1,
                CompanyId: 0,
                Name: 'WhatsApp',
                AttrField: 'whatsapp',
                AttrType: 2,
                AttrComment: 'WhatsApp',
                Enable: 1,
                CreateTime: 0,
                UpdateTime: 0,
                Categories: null,
              },
              {
                Id: 6,
                IsSystem: 1,
                CompanyId: 0,
                Name: 'Phone',
                AttrField: 'phone',
                AttrType: 2,
                AttrComment: 'Phone',
                Enable: 1,
                CreateTime: 0,
                UpdateTime: 0,
                Categories: null,
              },
              {
                Id: 52,
                IsSystem: 0,
                CompanyId: 60013,
                Name: 'Birthday',
                AttrField: 'Birthday',
                AttrType: 5,
                AttrComment: '',
                Enable: 1,
                CreateTime: 1772091265,
                UpdateTime: 0,
                Categories: null,
              },
            ]}
            // leftPanelSlot={<div onClick={() => console.log('Hello World')}>Hello World</div>}
            imageUploadHandler={exampleImageUploadHandler}
            videoUploadHandler={exampleVideoUploadHandler}
            onChange={() => {
              // Don't log the full html/document here; updates are frequent and would bog down the console
            }}
            onNameChange={(name) => {
              console.log('Name changed:', name);
            }}
            onSamplesDrawerToggle={(isOpen) => {
              console.log('Samples drawer toggled:', isOpen);
            }}
            onInspectorDrawerToggle={(isOpen) => {
              console.log('Inspector drawer toggled:', isOpen);
            }}
          />
        ) : (
          <HtmlEditor
            value={htmlCode}
            onChange={(value) => {
              setHtmlCode(value);
            }}
            initialMode="split"
            initialDevice="desktop"
          />
        )}
        <SpeedDial
          ariaLabel="Test actions"
          sx={{ position: 'fixed', bottom: 16, left: 16, zIndex: 1000 }}
          icon={<SpeedDialIcon />}
          onClose={() => setSpeedDialOpen(false)}
          onOpen={() => setSpeedDialOpen(true)}
          open={speedDialOpen}
        >
          <SpeedDialAction
            key="saveData"
            icon={<FileDownloadOutlined />}
            tooltipTitle="Get saved data"
            onClick={handleSave}
          />
          <SpeedDialAction
            key="loadTestJSON"
            icon={<FileUploadOutlined />}
            tooltipTitle="Load test data"
            onClick={handleLoadTestJSON}
          />
          <SpeedDialAction
            key="json"
            icon={<DataObjectOutlined />}
            tooltipTitle={`JSON features: ${showJsonFeatures ? 'shown' : 'hidden'}`}
            onClick={handleToggleJsonFeatures}
          />
          <SpeedDialAction
            key="samplesDrawerTitle"
            icon={<TitleOutlined />}
            tooltipTitle={`Sidebar title: ${showSamplesDrawerTitle ? 'shown' : 'hidden'}`}
            onClick={handleToggleSamplesDrawerTitle}
          />
          <SpeedDialAction
            key="toggleEditor"
            icon={editorMode === 'email' ? <CodeIcon /> : <EmailIcon />}
            tooltipTitle={`Switch to: ${editorMode === 'email' ? 'HTML editor' : 'Email editor'}`}
            onClick={handleToggleEditorMode}
          />
        </SpeedDial>
      </Box>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Home />
);
