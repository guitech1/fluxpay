# Deploy

Site: https://fluxpay-sohn.netlify.app

Production tracks `main`.

## FluxPay Card (2026-09-29)

- Code on `main` (service, routes, UI 3D, admin, tests, migration 020)
- Supabase schema applied on project `mrfbmndbazeajgyozhfb`
- RPCs: `fluxpay_generate_card_number`, `fluxpay_card_transfer` (service_role only)
- Dashboard: `/dashboard/fluxpay-card`
- Admin: `/admin/fluxpay-card`

## Previous

Deployed state includes PR #2:
- fix(admin): repair action UX, role gates, and balance release RPC (`f793c042`)
- isAdminRole, ReasonDialog, canAct gates
- migration 017 file on main
