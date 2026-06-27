# concurrent-solicitud-creation Specification

## Purpose

Define the concurrency contract for solicitud creation so parallel requests do not create duplicate PINs or corrupt persisted records.

## Requirements

### Requirement: Collision-safe solicitud creation

The system MUST create solicitudes safely under concurrent requests without persisting duplicate PINs.

#### Scenario: Concurrent creates produce unique PINs
- GIVEN multiple valid create requests arrive at the same time
- WHEN the system processes them concurrently
- THEN each persisted solicitud has a unique PIN
- AND no request corrupts another request's data

#### Scenario: PIN collision is retried safely
- GIVEN a generated PIN conflicts with an existing or racing solicitud
- WHEN the system attempts to persist it
- THEN the request is retried or otherwise resolved safely
- AND the final persisted record remains unique

### Requirement: Concurrent failure isolation

The system MUST isolate one failing concurrent creation from other in-flight creations.

#### Scenario: One request fails, others succeed
- GIVEN one concurrent creation hits a duplicate or transient persistence error
- WHEN the batch completes
- THEN the failed request is reported as failed
- AND other successful requests remain committed
