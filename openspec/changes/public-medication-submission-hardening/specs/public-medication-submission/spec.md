# Public Medication Submission Specification

## Purpose

Define the public `solicitudes` submission behavior for unauthenticated medication records, contributor identity requirements, phone validation, and public contact visibility.

## Requirements

### Requirement: Unauthenticated Immediate Publication

The `solicitudes` domain MUST allow public medication submissions without authentication and MUST publish accepted submissions immediately.

#### Scenario: Anonymous visitor submits a valid medication record

- GIVEN an unauthenticated visitor completes the public medication submission with valid required data
- WHEN the visitor submits the form
- THEN the system MUST accept the submission without requiring login
- AND the new record MUST become publicly visible immediately

### Requirement: Required Contributor Identity

The `solicitudes` domain MUST require contributor name and contributor phone for public medication submissions. The system MUST reject submissions that omit either field.

#### Scenario: Missing contributor name blocks submission

- GIVEN an unauthenticated visitor enters medication data without a contributor name
- WHEN the visitor submits the form
- THEN the system MUST reject the submission
- AND the rejection MUST identify the missing contributor name

#### Scenario: Missing contributor phone blocks submission

- GIVEN an unauthenticated visitor enters medication data without a contributor phone
- WHEN the visitor submits the form
- THEN the system MUST reject the submission
- AND the rejection MUST identify the missing contributor phone

### Requirement: Shared Phone Validation And Error Feedback

The `solicitudes` domain MUST enforce the same phone validation policy in frontend and backend. The policy MUST accept valid Venezuelan numbers and valid international numbers, and MUST reject malformed phone values. Invalid phone input MUST block submission and MUST show a clear error.

#### Scenario: Valid Venezuelan phone is accepted

- GIVEN an unauthenticated visitor enters all required data with a valid Venezuelan phone number
- WHEN the visitor submits the form
- THEN the system MUST accept the phone value
- AND the submission MUST continue without a phone validation error

#### Scenario: Valid international phone is accepted

- GIVEN an unauthenticated visitor enters all required data with a valid international phone number
- WHEN the visitor submits the form
- THEN the system MUST accept the phone value
- AND the submission MUST continue without a phone validation error

#### Scenario: Invalid phone shows a clear blocking error

- GIVEN an unauthenticated visitor enters all required data with a malformed phone number
- WHEN the visitor submits the form
- THEN the system MUST reject the submission
- AND the system MUST show a clear phone validation error to the visitor

### Requirement: Public Contact Visibility

The `solicitudes` domain MUST keep contributor name and contributor phone publicly visible on accepted public medication records.

#### Scenario: Accepted submission exposes contributor contact publicly

- GIVEN a public medication submission has been accepted
- WHEN any visitor views the public medication record
- THEN the system MUST display the contributor name and contributor phone
- AND the visibility rules MUST remain unchanged from the current public contact model
