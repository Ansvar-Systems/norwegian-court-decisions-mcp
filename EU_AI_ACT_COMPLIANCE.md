# EU AI Act Compliance

## Norway and the EU AI Act

Norway is a member of the European Economic Area (EEA) but not the EU. The EU AI Act (Regulation (EU) 2024/1689) was adopted by the EU in 2024. As of 2025, formal adoption through the EEA Agreement (EØS-avtalen) is still pending — EEA/EFTA states must receive the act through the EEA Joint Committee process before it becomes binding in Norwegian law.

Until the EU AI Act is formally incorporated into the EEA Agreement, Norway's obligations derive from:

- **Personopplysningsloven** (LOV-2018-06-15-38) — implements GDPR via EEA Agreement Annex XI, nr. 5e. The GDPR's transparency and accountability principles apply to AI systems that process personal data.
- **Markedsføringsloven** (LOV-2009-01-09-2) — consumer protection rules that apply to AI-generated outputs
- **EØS-avtalen** (EEA Agreement) — the general obligation to implement internal market legislation, including future AI Act incorporation
- **NSM guidelines** — Nasjonal sikkerhetsmyndighet has published guidance on AI risk management for critical infrastructure sectors

<!-- TODO: update this section once the EU AI Act EEA Joint Committee decision is published. Track at https://www.efta.int/EEA/EEA-Joint-Committee-Decisions -->

## Classification of This Tool

This Tool is a **general-purpose AI system** used for legal research. It is **not** a high-risk AI system under Annex III of the EU AI Act. Specifically:

- It is **not** used by courts or prosecutors to make case outcome decisions (which would fall under Annex III, point 8a — administration of justice)
- It returns verbatim statutory text from a database; it does not make legal determinations
- The AI component (Claude LLM) is the customer's inference layer, not a system embedded in this Tool

## Transparency Obligations

Even before formal EEA incorporation, Ansvar Systems applies the AI Act's transparency principles voluntarily:

### Transparency (Article 50 / Article 52 equivalent)

- **AI Disclosure**: This Tool uses algorithmic search and ranking methods
- **User Awareness**: Users are notified that results are database-driven and require independent verification
- **Source Disclosure**: Every tool response includes `_citation` fields identifying the source statute and its Lovdata identifier

### Data Quality

- All statute text is ingested verbatim from api.lovdata.no under NLOD 2.0
- No LLM-generated content is stored in the database or returned as statute text
- Staleness warnings are emitted when data exceeds the configured freshness threshold

## GDPR / Personopplysningsloven Intersection

Where this Tool is used to process queries containing personal data (e.g., a lawyer querying about a specific individual's case), Personopplysningsloven applies to the query processing. See [PRIVACY.md](PRIVACY.md) for obligations under Personopplysningsloven § 13 (data processing agreements) and § 24 (data protection impact assessments).

## EEA Sovereignty Note

Norwegian courts and regulators apply EEA law consistent with EU interpretation (homogeneity principle under EØS-avtalen Article 6 and Protocol 35). CJEU case law on GDPR, the AI Act, and related instruments is therefore highly relevant to Norwegian legal analysis even before formal EEA incorporation.

---

**Last Updated**: 2026-05-02
