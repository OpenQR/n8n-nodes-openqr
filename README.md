# OpenQR.io node for n8n

The official [n8n](https://n8n.io) node for **[OpenQR.io](https://openqr.io)**. It creates dynamic and static QR codes, changes where they point, and downloads them as SVG files, all inside your workflows. It also manages folders and logos, and checks your plan usage.

- [Install](#install)
- [Credentials](#credentials)
- [Operations](#operations)
- [Dynamic and static codes](#dynamic-and-static-codes)
- [Updating a code](#updating-a-code)
- [Limits and large batches](#limits-and-large-batches)
- [Using it with an AI Agent](#using-it-with-an-ai-agent)
- [Example workflows](#example-workflows)
- [Compatibility](#compatibility)
- [Roadmap](#roadmap)
- [Development](#development)

## Install

In n8n, go to **Settings > Community Nodes > Install** and enter the package name exactly:

```
@openqr-io/n8n-nodes-openqr
```

Other packages have similar names but aren't from OpenQR.io. Check that the name starts with `@openqr-io/`.

On a self-hosted instance you can also install it from the command line, as described in n8n's [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

The node signs in with an OpenQR.io API key.

1. Sign in at [dashboard.openqr.io](https://dashboard.openqr.io).
2. Open the user menu and choose **API Keys**.
3. Create a key and copy it. It's shown only once.
4. In n8n, create an **OpenQR.io API** credential and paste the key into **API Key**.

Leave **Base URL** as it is (`https://api.openqr.io/api/v1`) unless OpenQR.io support gives you a different one. n8n tests the key when you save the credential.

API access depends on your plan. See the [API documentation](https://docs.openqr.io) for details.

## Operations

| Resource | Operation                        | What it does                                                                                      |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| QR Code  | Create                           | Create and save a code. Optionally download its SVG in the same step.                             |
|          | Get                              | Get one code by ID.                                                                               |
|          | Get Many                         | List codes, newest first. Filter by folder, or list archived codes.                               |
|          | Get Image                        | Download a code's image as an SVG file, ready to attach to an email or upload to Drive.           |
|          | Update                           | Change a code's content, name, folder, domain or design. See [Updating a code](#updating-a-code). |
|          | Archive                          | Archive a code. It stops counting towards your plan, and a dynamic code stops redirecting.        |
|          | Preview                          | Get the SVG of a code without saving it.                                                          |
|          | Save Preview                     | Save a previewed code, keeping the short link shown in the preview.                               |
| Folder   | Create, Get Many, Rename, Delete | Organise codes. Deleting a folder keeps its codes and moves them out of it.                       |
| Logo     | Upload, Get Many                 | Upload a PNG or JPEG logo from a binary field, then use it in a code's **Design**.                |
| Account  | Get Plan Usage                   | Plan name, codes used, the limit, and how many codes can still be created.                        |

You can create these types, each as dynamic or static: URL, Text, Call, SMS, Email, Wi-Fi, Location, Event and vCard.

- **Dynamic Event and vCard codes** open a landing page. Build the page in the dashboard, then enter its ID as **Landing Page ID**.
- **PDF, links page, social, app and GS1 codes** are managed in the dashboard. They appear in Get Many but can't be created or updated through the API.

Every code can have a **Design**: colours, module and corner shapes, a frame with text, and a logo.

## Dynamic and static codes

- **Dynamic** codes hold a short link. You can change where they point after printing, and they record scans.
- **Static** codes hold the content itself. They can't be changed once printed and don't record scans.

Both kinds count towards your plan's limit while they're active. Archived codes don't count.

## Updating a code

The API replaces a code's settings on every update, so the node does some of the work for you:

- **Name, folder and custom domain** are read from the code first and kept, unless you change them under **Update Fields**.
- **Type** must be set to the code's current type, because it decides which content fields are shown. A code's type can't change. If they don't match, the node stops before changing anything.
- **Content** must be filled in on every update.
- **Design is reset** by every update. If the printed code has colours, a frame or a logo, fill in **Design** with the same settings each time. Otherwise the code goes back to plain black and white. Reading the current design back from the API is on the [roadmap](#roadmap).

For a dynamic code, every printed copy opens the new content straight away. For a static code, only the image changes: printed copies keep the old content.

## Limits and large batches

An OpenQR.io account can make **100 requests a minute**. **60** of those can create, preview or update codes. Requests from the dashboard count too.

- **Retries:** the node waits and retries when it reaches a limit, and when another code is still being created on the account.
- **Large sheets:** a big sheet is still bound by the per-minute limit. Use **Loop Over Items** with a batch of about 10, followed by a **Wait** node of 10 seconds. The [sheet template](templates/sheet-to-qr-codes.json) does this.
- **Plan size:** check **Account > Get Plan Usage** first, so a run doesn't stop halfway when the plan is full.

Errors say what went wrong and how to fix it. They include the item number, so you can find the row that caused them. Turn on **Continue On Fail** to keep going past a bad row.

## Using it with an AI Agent

The node can be used as a tool by n8n's AI Agent, for example "make a QR code for this link and send it to me". Each tool is described to the agent by its operation, such as "Create and save a QR code in OpenQR.io".

- **Safe to give an agent:** Create, Get, Get Many, Get Image, Preview and Get Plan Usage.
- **Use with care:** Update changes what every printed copy of a dynamic code opens, and Archive stops a dynamic code working. Only give these to an agent with n8n's human review turned on for the tool, or keep them out of agent workflows.

The QR code's JSON includes its `image` link, so an agent that can't handle files can still send the image to someone.

## Example workflows

Import any of these from the [`templates`](templates) folder: in n8n, use **Import from File** on a new workflow.

| Workflow                                                                    | What it does                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Sheet to QR codes](templates/sheet-to-qr-codes.json)                       | Creates a dynamic URL code for every row in a Google Sheet, saves each SVG to Google Drive, and writes the code's ID and image link back to the row. Batches requests to stay within the limits. |
| [Scheduled destination change](templates/scheduled-destination-change.json) | Points one printed code at the lunch menu at 11:00 and the dinner menu at 17:00.                                                                                                                 |
| [New client folder](templates/new-client-folder.json)                       | Creates a folder for each new client from a form. Swap the form for your CRM's trigger.                                                                                                          |
| [Plan limit alert](templates/plan-limit-alert.json)                         | Checks the plan every morning and emails you when 10% or fewer of its codes are left.                                                                                                            |

Each template has a note with setup steps.

## Compatibility

Built and tested with n8n 2.46. Older versions haven't been tested.

## Roadmap

Coming in later versions, without fixed dates:

- **Scan stats** for dynamic codes, such as all-time scans and breakdowns by day, country and device.
- **PNG** images next to SVG.
- **Updates that keep the design and content** you don't change, and the short link on each code.

Ideas and bug reports are welcome in [GitHub issues](https://github.com/OpenQR/n8n-nodes-openqr/issues).

## Development

```bash
npm install
npm run dev     # starts n8n with this node at http://localhost:5678
npm test        # builds the node and runs the unit tests
npm run lint
```

To test against a local OpenQR backend, set **Base URL** in the credential to its address, for example `http://localhost:8000/api/v1`. Keep the key in a local `.env` file (see [`.env.example`](.env.example)), which git ignores.

## Resources

- [OpenQR.io](https://openqr.io)
- [OpenQR.io API documentation](https://docs.openqr.io)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
