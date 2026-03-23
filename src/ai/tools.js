const tools = [
  {
    type: "function",
    function: {
      name: "run_shell_command",
      description: "Execute a shell command on the Raspberry Pi and return stdout/stderr. Use for system tasks, file operations, package management, installing software, modifying configurations, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The bash command to execute" },
          timeout_ms: { type: "number", description: "Timeout in ms (default 30000, max 120000)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_url",
      description: "Navigate the browser to a URL. Returns the page title and takes a screenshot.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: "Click an element on the current browser page using a CSS selector. Waits for element to be visible first. Takes a screenshot after clicking.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the element to click" },
        },
        required: ["selector"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Type text into a form field on the current browser page. Waits for element to be visible first. Types with human-like delay.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the input field" },
          text: { type: "string", description: "Text to type into the field" },
          clear_first: { type: "boolean", description: "Clear field before typing (default true)" },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "press_key",
      description: "Press a keyboard key (e.g., Enter, Tab, Escape, ArrowDown). Use after typing to submit forms or navigate.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key name: Enter, Tab, Escape, ArrowDown, ArrowUp, Backspace, etc." },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll_page",
      description: "Scroll the current browser page up or down.",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
          amount: { type: "number", description: "Pixels to scroll (default 500)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Take a screenshot of the current browser page.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_text",
      description: "Extract all visible text from the current browser page. Use this to read web page content.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Optional CSS selector to extract text from a specific element" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_page_html",
      description: "Get the HTML structure of the page or a specific element. Useful for finding correct CSS selectors when elements are hard to locate.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Optional CSS selector to get HTML of specific element" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Get Raspberry Pi system status: CPU load, memory usage, disk space, temperature, and uptime.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file on the filesystem.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          max_lines: { type: "number", description: "Max lines to read (default 200)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates the file if it doesn't exist. Use this to modify bot code, create scripts, save data, etc.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write to" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (default: current directory)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save a piece of information to long-term memory. Use this to remember user preferences, learnings, important facts, or anything that should persist across conversations.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Short identifier for this memory (e.g., 'user_name', 'wifi_password_location', 'preferred_search_engine')" },
          value: { type: "string", description: "The information to remember" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Retrieve information from long-term memory. Use this to recall previously saved facts, preferences, or learnings.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "The memory key to recall, or 'all' to list all saved memories" },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_email",
      description: "Configure email account for sending/receiving. Store SMTP and IMAP settings. For Gmail: smtp_host=smtp.gmail.com, smtp_port=587, imap_host=imap.gmail.com, imap_port=993. Use an app password, not the regular password.",
      parameters: {
        type: "object",
        properties: {
          smtp_host: { type: "string" },
          smtp_port: { type: "number" },
          imap_host: { type: "string" },
          imap_port: { type: "number" },
          user: { type: "string", description: "Email address" },
          pass: { type: "string", description: "App password or email password" },
        },
        required: ["smtp_host", "imap_host", "user", "pass"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email. Requires email to be configured first with configure_email. Always requires user approval.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string" },
          body: { type: "string", description: "Email body text" },
          attachments: { type: "array", items: { type: "string" }, description: "Array of file paths to attach" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_email",
      description: "Check email inbox. Returns latest messages with subject, sender, date.",
      parameters: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Mail folder (default: INBOX)" },
          limit: { type: "number", description: "Max messages to return (default: 10)" },
          unread_only: { type: "boolean", description: "Only return unread messages" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reply_email",
      description: "Reply to an email by UID. Fetches the original and sends reply via SMTP.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "number", description: "UID of the email to reply to (from check_email results)" },
          folder: { type: "string", description: "Mail folder (default: INBOX)" },
          body: { type: "string", description: "Reply text" },
        },
        required: ["uid", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_email",
      description: "Search emails by subject or sender.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (matches subject and sender)" },
          folder: { type: "string", description: "Mail folder (default: INBOX)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_document",
      description: "Create a PDF, DOCX, or HTML document. Use for resumes, cover letters, reports, etc. The document is automatically sent to the user via Telegram for review.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pdf", "docx", "html"], description: "Document format" },
          title: { type: "string", description: "Document title" },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                heading: { type: "string", description: "Section heading (optional)" },
                body: { type: "string", description: "Section body text" },
              },
            },
            description: "Array of sections, each with optional heading and body text",
          },
        },
        required: ["type", "title", "sections"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_browser_data",
      description: "Clear all browser cookies, sessions, and cached data. Use when login sessions are corrupted or to start fresh.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "solve_captcha",
      description: "When you detect a CAPTCHA on a page, call this to take a screenshot and ask the user for help. Use this as a fallback when automated solving fails.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "switch_model",
      description: "Switch the AI model. Available: fast (gpt-4o-mini), standard (gpt-4o), reasoning (o1-mini), claude-sonnet, claude-haiku. Use 'fast' for simple tasks, 'standard' for complex tasks, 'reasoning' for hard logic problems.",
      parameters: {
        type: "object",
        properties: {
          model: { type: "string", description: "Model name: fast, standard, reasoning, claude-sonnet, claude-haiku, or a raw model ID" },
        },
        required: ["model"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_session_approval",
      description: "Request batch approval from the user for a multi-step workflow. Use this BEFORE starting long browser tasks (e.g., job applications, form filling) to avoid asking for approval on every click. The user will see a single approval button.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Brief description of what you'll be doing (e.g., 'Apply to 5 jobs on LinkedIn')" },
          minutes: { type: "number", description: "How long the session approval should last (default 30)" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "self_modify",
      description: "Safely modify Jarvis's own source code. Backs up first, writes new code, syntax-checks, and restarts. Use this to add features, fix bugs, or improve yourself. ALWAYS describe what you're changing.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path (e.g., 'src/tools/browser.js')" },
          content: { type: "string", description: "Complete new file content" },
          description: { type: "string", description: "What this change does" },
        },
        required: ["file", "content", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rollback_code",
      description: "Rollback to the most recent code backup. Use if a self_modify broke something.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a persistent task for complex multi-step workflows that may span multiple messages. Break the workflow into steps.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Task name" },
          steps: { type: "array", items: { type: "string" }, description: "Array of step descriptions" },
          context: { type: "string", description: "Additional context for the task" },
        },
        required: ["name", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update task progress. Mark steps as completed and advance to next step.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID" },
          currentStep: { type: "number", description: "Current step index" },
          stepStatus: { type: "string", enum: ["pending", "completed", "failed", "skipped"] },
          status: { type: "string", enum: ["in_progress", "completed", "paused", "failed"] },
          context: { type: "string", description: "Updated context" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task",
      description: "Get full details of a task including all steps and their status.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List all tasks with their current status and progress.",
      parameters: { type: "object", properties: {} },
    },
  },
  // === v5: Excel + PDF ===
  { type: "function", function: { name: "create_excel", description: "Create an Excel spreadsheet (.xlsx). Sent to user via Telegram.", parameters: { type: "object", properties: { title: { type: "string" }, sheets: { type: "array", items: { type: "object", properties: { name: { type: "string" }, headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } } }, description: "Array of sheets with name, headers, and rows" } }, required: ["title", "sheets"] } } },
  { type: "function", function: { name: "read_excel", description: "Read an Excel file (.xlsx). Returns headers and rows.", parameters: { type: "object", properties: { path: { type: "string", description: "Path to .xlsx file" }, sheet: { type: "string", description: "Sheet name (optional, defaults to first)" } }, required: ["path"] } } },
  { type: "function", function: { name: "read_pdf", description: "Extract text from a PDF file.", parameters: { type: "object", properties: { path: { type: "string", description: "Path to PDF file" } }, required: ["path"] } } },
  // === v5: Browser Power Tools ===
  { type: "function", function: { name: "download_file", description: "Download a file from the current page. Click a download link/button and wait for the file.", parameters: { type: "object", properties: { selector: { type: "string", description: "CSS selector of download link/button to click (optional — omit if download is already triggered)" } } } } },
  { type: "function", function: { name: "upload_file", description: "Upload a file to a file input on the page.", parameters: { type: "object", properties: { selector: { type: "string", description: "CSS selector of the file input element" }, file_path: { type: "string", description: "Local path of file to upload" } }, required: ["selector", "file_path"] } } },
  { type: "function", function: { name: "select_dropdown", description: "Select an option from a dropdown. Works with both native <select> and custom React/Angular dropdowns.", parameters: { type: "object", properties: { selector: { type: "string", description: "CSS selector of the dropdown" }, value: { type: "string", description: "Option value to select" }, text: { type: "string", description: "Option visible text to select (used if value not found)" } }, required: ["selector"] } } },
  { type: "function", function: { name: "check_box", description: "Check or uncheck a checkbox.", parameters: { type: "object", properties: { selector: { type: "string", description: "CSS selector of the checkbox" }, checked: { type: "boolean", description: "Desired state (true=checked, false=unchecked)" } }, required: ["selector", "checked"] } } },
  { type: "function", function: { name: "find_by_text", description: "Find an element by its visible text content (XPath). Essential for React/Angular apps where CSS selectors are unreliable.", parameters: { type: "object", properties: { text: { type: "string", description: "Text to search for" }, tag: { type: "string", description: "HTML tag to filter (e.g., 'button', 'a', 'span'). Default: any" }, click: { type: "boolean", description: "Click the first match (default false)" } }, required: ["text"] } } },
  { type: "function", function: { name: "execute_js", description: "Execute JavaScript in the browser page context. Use as escape hatch for complex UI (date pickers, React state, etc.).", parameters: { type: "object", properties: { code: { type: "string", description: "JavaScript code to execute. Return value will be captured." } }, required: ["code"] } } },
  { type: "function", function: { name: "open_tab", description: "Open a new browser tab.", parameters: { type: "object", properties: { name: { type: "string", description: "Name for this tab" }, url: { type: "string", description: "URL to navigate to (optional)" } }, required: ["name"] } } },
  { type: "function", function: { name: "switch_tab", description: "Switch to a different browser tab.", parameters: { type: "object", properties: { name: { type: "string", description: "Tab name to switch to" } }, required: ["name"] } } },
  { type: "function", function: { name: "close_tab", description: "Close a browser tab.", parameters: { type: "object", properties: { name: { type: "string", description: "Tab name to close" } }, required: ["name"] } } },
  { type: "function", function: { name: "list_tabs", description: "List all open browser tabs.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "handle_popup", description: "Handle popup windows (OAuth, etc). Switch to or close popup.", parameters: { type: "object", properties: { action: { type: "string", enum: ["switch", "close"], description: "switch = switch to popup, close = close popup and return" } }, required: ["action"] } } },
  // === v5: Vision ===
  { type: "function", function: { name: "analyze_screenshot", description: "Send a screenshot to GPT-4o vision to 'see' and describe what's on screen. Use when HTML/text alone isn't enough to understand the page.", parameters: { type: "object", properties: { image_path: { type: "string", description: "Path to screenshot (optional — uses latest if omitted)" }, question: { type: "string", description: "What to look for or describe" } }, required: ["question"] } } },
  // === v5: Images ===
  { type: "function", function: { name: "process_image", description: "Process an image: resize, crop, convert format, compress.", parameters: { type: "object", properties: { input_path: { type: "string" }, output_path: { type: "string", description: "Optional output path" }, operations: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["resize", "crop", "convert", "compress"] }, width: { type: "number" }, height: { type: "number" }, left: { type: "number" }, top: { type: "number" }, format: { type: "string" }, quality: { type: "number" } } }, description: "Array of operations to apply" } }, required: ["input_path", "operations"] } } },
  // === v5: OTP ===
  { type: "function", function: { name: "request_otp", description: "Ask the user for a 2FA/OTP verification code via Telegram. Use when a website asks for SMS, authenticator, or email verification.", parameters: { type: "object", properties: { site: { type: "string", description: "Which site needs the code" }, type: { type: "string", enum: ["sms", "authenticator", "email"], description: "Type of OTP" } }, required: ["site"] } } },
  // === v5: Credentials ===
  { type: "function", function: { name: "save_credential", description: "Save login credentials to the encrypted vault.", parameters: { type: "object", properties: { site: { type: "string" }, username: { type: "string" }, password: { type: "string" }, notes: { type: "string" } }, required: ["site", "username", "password"] } } },
  { type: "function", function: { name: "get_credential", description: "Retrieve login credentials from the vault. Never display the password in chat — use it directly in forms.", parameters: { type: "object", properties: { site: { type: "string" } }, required: ["site"] } } },
  { type: "function", function: { name: "list_credentials", description: "List all saved credentials (site + username only, no passwords).", parameters: { type: "object", properties: {} } } },
  // === v5: Calendar ===
  { type: "function", function: { name: "configure_calendar", description: "Configure Google Calendar API access. Provide the service account credentials JSON.", parameters: { type: "object", properties: { credentials_json: { type: "string", description: "Google service account credentials JSON string" } }, required: ["credentials_json"] } } },
  { type: "function", function: { name: "list_calendar_events", description: "List upcoming Google Calendar events.", parameters: { type: "object", properties: { days: { type: "number", description: "Number of days ahead to look (default 7)" }, max_results: { type: "number", description: "Max events (default 20)" } } } } },
  { type: "function", function: { name: "create_calendar_event", description: "Create a Google Calendar event.", parameters: { type: "object", properties: { summary: { type: "string" }, description: { type: "string" }, start: { type: "string", description: "ISO 8601 datetime" }, end: { type: "string", description: "ISO 8601 datetime" }, attendees: { type: "array", items: { type: "string" }, description: "Email addresses" } }, required: ["summary", "start", "end"] } } },
  { type: "function", function: { name: "update_calendar_event", description: "Update an existing Google Calendar event.", parameters: { type: "object", properties: { event_id: { type: "string" }, summary: { type: "string" }, description: { type: "string" }, start: { type: "string" }, end: { type: "string" }, attendees: { type: "array", items: { type: "string" } } }, required: ["event_id"] } } },
  { type: "function", function: { name: "delete_calendar_event", description: "Delete a Google Calendar event and notify attendees.", parameters: { type: "object", properties: { event_id: { type: "string", description: "The event ID to delete" } }, required: ["event_id"] } } },
  // === v6: New tools ===
  { type: "function", function: { name: "read_email_body", description: "Read the full body text of an email by UID. Use for parsing meeting invites, itineraries, and detailed content.", parameters: { type: "object", properties: { uid: { type: "string", description: "Email UID from check_email" }, folder: { type: "string", description: "IMAP folder (default INBOX)" } }, required: ["uid"] } } },
  { type: "function", function: { name: "analyze_form", description: "Scan the current page for all form elements and return their selectors, types, labels, and required status. Call this BEFORE filling any form.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "wait_for_element", description: "Wait for a CSS selector to appear on the page. Use when pages are slow to load or after navigation.", parameters: { type: "object", properties: { selector: { type: "string", description: "CSS selector to wait for" }, timeout_ms: { type: "number", description: "Max wait time in ms (default 10000)" } }, required: ["selector"] } } },
];

module.exports = tools;
