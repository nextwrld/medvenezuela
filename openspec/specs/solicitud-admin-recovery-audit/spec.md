# Solicitud Admin Recovery Audit Specification

## Purpose

Define the controlled admin path for lost closure credentials and the audit trail required for override actions.

## Requirements

### Requirement: Admin-only recovery or override for lost closure PINs

The system MUST allow authenticated administrators to recover or override terminal closure when the requester has lost `pinCierre`. Non-admin users MUST NOT use this path. Every override or recovery action MUST require an explicit reason.

#### Scenario: Admin closes a solicitud after lost PIN report

- GIVEN a solicitud cannot be closed because the requester no longer has `pinCierre`
- AND an authenticated administrator is authorized for override actions
- WHEN the administrator submits a closure override with a reason
- THEN the system MUST allow the terminal transition to `recibido`
- AND the action SHALL be marked as an admin override

#### Scenario: Non-admin override request is denied

- GIVEN a user without admin privileges attempts the recovery or override path
- WHEN that user submits a closure override request
- THEN the system MUST reject the request
- AND the solicitud status SHALL remain unchanged

#### Scenario: Missing reason blocks admin override

- GIVEN an authenticated administrator starts a recovery or override action
- WHEN the administrator omits the required reason
- THEN the system MUST reject the action
- AND no override SHALL be executed

### Requirement: Audit trail for recovery and override activity

The system MUST persist an audit record for each admin recovery or closure override, including who acted, why they acted, and when the action occurred. The audit trail SHOULD remain available even if rollout behavior is later rolled back.

#### Scenario: Audit record stored for admin override

- GIVEN an administrator successfully performs a recovery or closure override
- WHEN the system commits the action
- THEN the system MUST store the administrator identity, reason, and timestamp
- AND the audit record SHALL reference the affected solicitud

#### Scenario: Failed override does not create misleading audit success

- GIVEN an administrator attempts recovery or override
- WHEN validation fails before the action is completed
- THEN the system MUST NOT store a success audit record for the override
- AND the failure MAY be logged separately without implying closure occurred
