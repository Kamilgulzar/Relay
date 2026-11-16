# Relay architecture

Relay is a new modular work-management application. The research folder remains unchanged. A Vinext/React application serves an authenticated UI and request handlers on a Cloudflare Worker. D1 stores indexed workspace documents and memberships; R2 stores attachments. Sites owns hosted authentication. Every request derives identity from the trusted hosting integration and checks workspace membership; private-project filtering is enforced server-side. Browser-local storage is used only for navigation and device preferences.

Domain records have typed validators and optimistic task versions. The document schema allows project views, forms, rules and custom fields to evolve without duplicating task data. Membership and workspace identity have relational constraints. Transport handlers, storage, business validation and view rendering are separate modules. This is a modular monolith, not a set of microservices.

External OAuth integrations, outbound email, enterprise SSO/SCIM, billing and model-powered AI require separately configured providers; their entry points must not pretend to be connected. In-app invitations, notifications, project summaries, forms and automation run against Relay's own persisted data. The deployment starts owner-private; sharing with other people also requires the hosting audience to permit them.
