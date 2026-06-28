# Solicitud Lifecycle Management Specification

## Purpose

Define split authorization for solicitud status transitions so intermediate management remains possible while terminal closure is restricted.

## Requirements

### Requirement: Split PIN authorization for lifecycle transitions

The system MUST use `pinGestion` for non-terminal lifecycle transitions and MUST require `pinCierre` for any transition to `recibido`. The system SHALL reject closure attempts made with only `pinGestion`. The public solicitud detail page MUST NOT reveal `pinCierre`.

#### Scenario: Intermediate update with management PIN

- GIVEN a solicitud in `activo` or `en_proceso`
- WHEN a client requests a non-terminal status change with a valid `pinGestion`
- THEN the system SHALL apply the requested non-terminal transition
- AND the system SHALL NOT require `pinCierre`

#### Scenario: Closure blocked with only management PIN

- GIVEN a solicitud not yet in `recibido`
- WHEN a client requests transition to `recibido` with a valid `pinGestion` and no valid `pinCierre`
- THEN the system MUST reject the closure request
- AND the solicitud status SHALL remain unchanged

#### Scenario: Public page hides closure credential

- GIVEN a public viewer opens the solicitud detail page
- WHEN the system renders solicitud credentials or actions
- THEN the system MUST NOT display `pinCierre`
- AND the page MAY continue to show only data allowed for public management flows

### Requirement: Closure data, migration, and abuse protection

The system MUST auto-generate `pinCierre` for new solicitudes and for all existing solicitudes during migration. A closure request MAY include `notasCierre`, but closure without notes MUST remain valid. The system SHOULD rate-limit failed closure attempts to reduce PIN guessing.

#### Scenario: Successful closure with optional notes omitted

- GIVEN a solicitud with a valid stored `pinCierre`
- WHEN a client requests transition to `recibido` with that `pinCierre` and no `notasCierre`
- THEN the system MUST close the solicitud
- AND the system SHALL persist an empty or null closure note without treating it as an error

#### Scenario: Existing solicitud receives generated closure PIN

- GIVEN a solicitud created before this capability exists
- WHEN the migration is applied
- THEN the system MUST assign a generated `pinCierre` to that solicitud
- AND later closure attempts SHALL validate against the generated value

#### Scenario: Repeated failed closure attempts are throttled

- GIVEN repeated invalid `pinCierre` submissions for the same solicitud or client identity
- WHEN the failure threshold is exceeded within the rate-limit window
- THEN the system SHOULD temporarily block additional closure attempts
- AND the system SHALL return a throttling response without changing the solicitud
