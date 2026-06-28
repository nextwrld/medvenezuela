# Moderator Solicitud Actions Specification

## Purpose

Define authorization behavior for restricted `solicitudes` edit and delete actions, including shared auth recognition for local admin moderators.

## Requirements

### Requirement: Moderator-Only Edit And Delete

The `solicitudes` and `auth` domains MUST restrict medication edit and delete actions to authenticated moderator-capable users only. Public visitors and public contributors MUST NOT gain edit or delete access from the public submission flow.

#### Scenario: Public visitor cannot edit a medication record

- GIVEN a medication record is publicly visible
- WHEN an unauthenticated visitor attempts an edit action
- THEN the system MUST deny the action
- AND the denial MUST preserve the record unchanged

#### Scenario: Public contributor cannot delete a medication record by virtue of submitting it

- GIVEN a contributor created a public medication submission without moderator privileges
- WHEN that contributor attempts a delete action
- THEN the system MUST deny the action
- AND the public submission capability MUST NOT broaden restricted permissions

### Requirement: Shared Moderator Authorization Context

The `auth` and `localAuth` domains MUST recognize verified local admin moderator context for the same restricted `solicitudes` edit and delete guards, without changing who is eligible for those actions.

#### Scenario: Verified local admin can perform a restricted action

- GIVEN a user has verified local admin moderator credentials
- WHEN that user performs a restricted edit or delete action
- THEN the system MUST authorize the action through the shared moderator guard
- AND the authorization result MUST match existing moderator-only policy

#### Scenario: Invalid or absent moderator context remains denied

- GIVEN a request lacks verified moderator context
- WHEN the request targets a restricted edit or delete action
- THEN the system MUST deny the action
- AND the system MUST NOT treat public submission data as authorization
