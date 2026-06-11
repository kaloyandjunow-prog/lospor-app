# Stored Data Model

The web API and PostgreSQL database are the source of truth for both clients. Patient names, national identifiers, and hospital file numbers are intentionally not stored.

## Account and access data

- **User:** email, names/title, password hash, role, primary institution, approval state, accepted terms/privacy versions and timestamps, last login, soft-deletion timestamp, creation timestamp.
- **Institution:** name, city, country.
- **RoleRequest:** requesting user, status, request and resolution timestamps.
- **RevokedToken:** JWT identifier, revocation time, expiry.
- **AuditLog:** user, action, affected entity, optional JSON detail, timestamp.

## Case lifecycle and collaboration

- **Case:** anonymous case code, private notes, owner, status, finalisation timestamp, creation/update timestamps.
- **CaseLock:** case, editing user, device ID, expiry.
- **CaseTransfer:** case, sender, recipient, initiator, status, creation/resolution timestamps.

## Clinical terminology

- **Icd10BgCode:** code and Bulgarian label.
- **Icd11Code:** code, English label, optional Bulgarian label.
- **Icd11Alias:** Bulgarian search term, translated English term, creation timestamp.
- **CustomTerm:** generated code, term, term type, optional institution scope, creation timestamp.

## Preoperative assessment

- Demographics: age, sex, height, weight, BMI, ABO blood type, Rh factor.
- Case details: diagnosis text, structured diagnoses JSON, planned procedure text, structured procedures JSON, ICD code, team notes.
- History: structured comorbidities, allergy flag/details, latex allergy, current medications, family anaesthesia problems/details, dental prosthetics, loose teeth, smoking, substance abuse.
- Vitals: systolic BP, diastolic BP, heart rate, arrhythmia flag, SpO2, temperature, respiratory rate.
- Airway: Mallampati, mouth opening, thyromental distance, neck mobility, upper-lip-bite test, retrognathia, prominent incisors, facial hair, difficult-airway history/notes, Cormack-Lehane grade.
- Risk: ASA, emergency/high-risk surgery; individual RCRI, Apfel, and STOP-BANG inputs; computed RCRI, Gupta, Apfel, and STOP-BANG scores.
- Labs and AI: structured lab-results JSON and AI-advisor opt-in.
- Metadata: creation/update timestamps.

## Intraoperative record

- Timing: month/year, duration, start time, end time.
- Position and technique: positions JSON and techniques JSON.
- Airway and ventilation: legacy airway device, tube size, cuff state, PEEP, IPPV/jet/FOB flags, airway tools/notes, Cormack-Lehane, airway devices JSON, ventilation modes JSON, DLT details, endobronchial size.
- Anaesthetic gas: volatile agent, legacy N2O/O2 percentages and L/min values, FGF L/min, carrier gas, FiO2.
- Access: plexus block, central-line site, arterial-line site, structured vascular-access JSON.
- Monitoring: ECG, urinary catheter, stomach tube, SpO2, invasive BP, CVP, blood glucose, blood gas, neurological monitoring, NBP, EtCO2, temperature, PA catheter, TEE, BIS, entropy, NIRS, evoked potentials, TOF.
- Medication and balance: evening/morning premedication, drugs JSON, crystalloids, colloids, blood, blood-product notes, urine.
- Timeline: time-series JSON, key-events/event-log JSON, complications.
- Metadata: creation/update timestamps.

## Postoperative record

- Modified Aldrete: activity, respiration, circulation, consciousness, SpO2 subscores and total.
- Recovery vitals: systolic BP, diastolic BP, heart rate, SpO2, temperature.
- Recovery assessment: pain NRS and PONV.
- Outcome: complications, destination, destination notes, handover-items JSON.
- Metadata: creation/update timestamps.

## Compatibility fields

Legacy intraoperative gas columns remain readable for older records. `timeInRecoveryMin` is removed by migration `20260609000000_intraop_gas_and_recovery_vitals`.
