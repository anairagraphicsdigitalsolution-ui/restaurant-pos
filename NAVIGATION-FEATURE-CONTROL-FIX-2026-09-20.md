# Navigation + Feature Control Fix

## Fixed
- P0 / P1 / P2 navigation section headings added to Admin Sidebar.
- P2 modules moved out of Restaurant Pro / Offers and into dedicated P2 Advanced Operations group.
- Call Center -> p2-call-center
- Banquet / Events / Catering -> p2-banquet-events
- Advanced Kiosk -> p2-advanced-kiosk
- Customer Display -> p2-customer-display
- Device HQ -> p2-device-hq
- AI Decision Intelligence -> p2-ai-intelligence
- Feature-gated items are no longer hidden from navigation when disabled; they show `🔒 Disabled`.
- Disabled feature click routes to Admin P0-P2 Control Center and explains that SuperAdmin controls activation.
- SuperAdmin menu includes Platform Control Center and Plugin Control Center.
- Plugin catalog now contains all six P2 feature codes, so SuperAdmin Plugin Control Center can activate/deactivate them per restaurant.
- Added Admin Control Center and SuperAdmin Platform Control Center routes.

## Security
Navigation visibility is not authorization. Existing server-side authorization remains authoritative. A disabled navigation item cannot be used to bypass protected API/database checks.

## Supabase
P2 plugin catalog records were applied and verified in project `vgzwzvmuylsoqjkqfcnw`.
