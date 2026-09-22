-- FluxPay organization-scoped optional KYC.
-- The production database was checked before implementation. The requested KYC
-- columns/table were not present, so this migration documents the schema that
-- the KYC backend now uses.

alter table public.organizations
  add column if not exists kyc_required boolean not null default false,
  add column if not exists kyc_status text not null default 'none',
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_document_type text,
  add column if not exists kyc_document_masked text,
  add column if not exists kyc_rejection_reason text,
  add column if not exists kyc_required_at timestamptz,
  add column if not exists kyc_required_by uuid;

alter table public.organizations
  drop constraint if exists organizations_kyc_status_check;
alter table public.organizations
  add constraint organizations_kyc_status_check
  check (kyc_status in ('none','pending','verified','rejected'));

alter table public.organizations
  drop constraint if exists organizations_kyc_document_type_check;
alter table public.organizations
  add constraint organizations_kyc_document_type_check
  check (kyc_document_type is null or kyc_document_type in ('CPF','CNPJ'));

create table if not exists public.kyc_verifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in ('CPF','CNPJ')),
  document_number text not null,
  document_masked text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  provider text not null default 'nexuspag',
  provider_verification_id text,
  external_id text,
  qr_code text,
  qr_code_image text,
  amount_cents bigint not null default 200 check (amount_cents = 200),
  expires_at timestamptz,
  provider_response jsonb,
  payer_name text,
  rejection_reason text,
  verified_at timestamptz,
  requested_by uuid references public.users(id),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  review_note text,
  approved_via text check (approved_via is null or approved_via in ('nexuspag','admin')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kyc_verifications_org_external_id_uq
  on public.kyc_verifications(organization_id, external_id)
  where external_id is not null;

create index if not exists kyc_verifications_org_created_idx
  on public.kyc_verifications(organization_id, created_at desc);

create index if not exists organizations_kyc_required_idx
  on public.organizations(kyc_required)
  where kyc_required = true;

alter table public.kyc_verifications enable row level security;

drop policy if exists "kyc_verifications_select_own_org" on public.kyc_verifications;
create policy "kyc_verifications_select_own_org"
  on public.kyc_verifications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = kyc_verifications.organization_id
        and om.user_id = (select auth.uid())
    )
  );

revoke all on public.kyc_verifications from authenticated, anon;
grant select (
  id, organization_id, document_type, document_masked, status, provider,
  provider_verification_id, external_id, qr_code, qr_code_image, amount_cents,
  expires_at, payer_name, rejection_reason, verified_at, requested_by,
  reviewed_by, reviewed_at, review_note, approved_via, metadata, created_at, updated_at
) on public.kyc_verifications to authenticated;
grant all on public.kyc_verifications to service_role;