## Firestore

All calls to firestore to read and write data must use the Firestore svelte5 store methods in /src/lib/db.svelte.ts

Refer to the following files for usage examples:
* src\routes\projects\[pid]\frames\+page.svelte
* src\routes\projects\[pid]\racks\+page.svelte


## Firestore Collections

* companies: clients and vendors
  - id is company full name
  - name
  - tel
  - fax
  - address
  - contact: contact person name
  - type: client | vendor

* currencies
  - id is 3 letter code of currency
  - code: is 3 letter code of currency

* details: each record is a detail of an item in an invoice or quote
  - cost: numeric
  - description
  - list: list price (string)
  - supplier
  - model: model of item
  - product
  - qty
  - total: calculated total of items

  - quoteid: string
  - percent: numeric percent value of margin
  - pos: numeric position/order of this item in the list
  - prices: list of prices from each vendor
    - vendor_code: { cost, name(vendor name), note, excluded:bool}
  - prices2: array of prices from each vendor (maybe not used?)

* drawings
  - id
  - pages collection
    - layers collection
      - id
      - active:bool
      - createdAt
      - updatedAt
      - locked:bool
      - visible:bool
      - name:string
      - order:number (sort order)
    - shapes collection
      - id
      - x1, y1, x2, y2
      - a: number (0-360) angle in degrees
      - type:string
      - sides: number of sides for polygon, or points for star (duplicated in properties)
      - layerId
      - layerid       DELETE THIS
      - points: array of points [{x,y}]
      - properties: object of props for rendering
        - fill, fontFamily, fontSize, fontStyle, fontWeight,
        - inner: number (0 to 1) inner radius for stars
        - markerSize, opacity, stroke, textAlign, textColor, textDecoration, verticalAlign,
        - stroke-width, strokeWidth
        - sides        MAYBE DELETE THIS
    - createdAt
    - id
    - landscape
    - margin: number
    - name
    - order: number
    - paperScale: number (1 to 1000)
    - paperSize: string (A3, A4 etc)
    - type: string (page | model)
    - updatedAt
  - createdAt
  - updatedAt
  - name
  - description
  - projectid

  - clientAddress?
  - clientLogo?: url to logo
  - clientName?
  - companyName?
  - companyLogo?: url to logo
  - companyAddress?
  - revisions: array of revisions
    { author, date: string (yyyy-mm-dd), note, rev:string (A, B, etc)}


* files: List of PDF and image file assets that have been uploaded to the app. The doc id is the filename.
  - pages: contains an array of details for PDF pages (1-based, to match pdf page numbers)
    - updatedAt
    - uploadedAt
    - crop
      - height, width, x, y: user specified area to crop useful part of the page
      origin: user specified origin of the page. Ideally a fixed location, easily identified on floorplans eg a corner of the building core walls or a pillar, that will be used to align future versions of the floorplan imported to replace previous version on the drawing
      - scale: defines the scale and a dimension line to correctly scale the drawing to real-world dimensions
        - distance: real-world distance
        - offset: offset of dimenstion line from the two endpoint markers
        - scale: calculated scale, based on drawing pixels between the endpoints and the real-world distance
        - x1,y1,x2,y2: positions of the endpoints in drawing units for the dimension line
        units: units of the real-world distance, usually 'mm'
    - projectId?: string
    - key?: UploadThing key
    - name?: filename
    - description?: string
    - size: size in bytes
    - url: url for accessing file from UploadThing

  * frames
    see frames tool documentation

  * leave: staff vacations - not used

  * library: CAD shape definitions for custom grouped shapes created by the user, for re-use in cad drawings
    - a: angle (number 0 to 360) of rotation in degrees
    - id
    - name: human readbale name for the shape
    - points: array of points {x,y}. used for lines or polygons/stars
    - properties: shape properties like stroke
    - type: basic shape type (rect, line, rect, ellipse, polygon, etc) or 'group' for a group of children
    - children: array of shape id's of child shapes in a group
    - parent: parent id if shape is a child
    - x1,y1,x2,y2: top-left, bottom-right position of shape. bounds of lines

  * locations: location info for objects like office desks and server racks
    - depth, height, width: world dimensions
    - x,y,z: world position
    - id: firestore id
    - type: 'rack', server
    - rack: rack name (eg "A101")
    - label: label
    - u: height in rack units, used for racks, servers, network devices
    - parent: id of parent object. used for servers, network devices, computers or monitors installed in racks or desks. x,y,z position values are relative to the parent object
    - ports?: array of ports - unused for now
    - devices?: array of devices - unused for now
    - angle: number indicating rotation in degrees around the vertical z-axis
    - maker?: maker (eg Panduit)
    - model?: model
    - order?: number indicating the order of the object when drawing
    - subtype?: sub-category of type (eg "4-post" for racks)

  * prefs: user preferences. doc id is users display name. this could be merged into users collection in future
    - address: address of users company
    - bank_details: bank account details for displying on invoices to clients
    - company: users company name
    - contact: user contact details (email I think, need to check old code)
    - tel: fax number
    - fax: fax number
    - margin: default margin to apply to unit prices when creating quotes (numeric, eg 20 for 20% margin)
    - show_tax: bool to display tax in quotes
    - tax_rate: tax rate (eg 10 for 10% tax)
    - currency: preferred currency

  * presence: users presense details. old ones need to be deleted (to be implemented)
    - displayName
    - userId
    - expiresAt
    - lastActive
    - tabId: current tool (eg 'cad')
    - pageId: current cad page
    - photoURL?: url to avatar
    - intent: current activity, eg 'idle'

  * projects: list of projects
    - id is a short id, used in url like /projects/{projectId}/tool
    - description
    - name
    - createdAt
    - ownerId
    - pdfFiles: array of PDF files uploaded for this project. duplicates much of the fields of the files collection above
    - updatedAt
    - settings
      - defaultOrigin: {x,y}
      - defaultPageSize: {height:297, width:210}
      - defaultScale: 10 (for 1:10 scale)

  * proposals
    - clientName
    - clientShortName
    - createdAt
    - keywords: editable list of keywords with values that will be substituted into auto-generated proposals and documents. some examples:
      - client_name
      - date: "2025/12/30"
      - project_name
    - sections: array of different sections of the proposal, ech with following fields
      - content
      - id
      - order: numeric value for sorting sections
      - title
    - status: draft | submitted, etc
    - title: document title
    - updatedAt
    - userId

  * templates: content teplates for including in proposals and documents
    - category
    - content: markdown content with {{keywords}} to be replaced
    - keywords: array of keywords and whether a required item
      - key: eg client_name
      - required: bool
      - value: human readable brief description of what to fill in for this keyword
    - tags: array of tags for the types of docs this template can be used in
    - title
    - updatedAt
    - userId


  * quotes: document this later. contains quote header details & notes and subcollections for details and suppliers

  * received: document this later. seems to be for received invoices or quotes from suppliers

  * settings: app settings for user. id is user email address - not used I think
    - displayName
    - email
    - uid

  * times: times for tracking staff attendance
    - breaks: numeric - duration of breaks, in hours
    - date: "yyyy-mm-dd"
    - start: "hh:mm"
    - finish: "hh:mm"
    - remark
    - type: normal | weekend , etc
    - uid

  * timesheets
    - client: client name
    - month: "yyyy-mm"
    - status: published | pending | approved
    - uid

  * users: user details. id is user email. save user details and preferences here
    - id: email
    - uid
    - phoneNumber
    - photoURL: avatar url
    - providerId: authentication provider (eg microsoft.com)
    - role: user | admin | guest
    - breaks: 1
    - carry_over: 22 (hours or days vacation carried over from previous year)
    - client: client name
    - contract: contract type (employee)
    - displayName
    - email
    - entitlement: annual vacation days entitled
    - start: default start time hh:mm
    - finish: default end time hh:mm
