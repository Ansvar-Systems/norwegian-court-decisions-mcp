# Data Licenses

## Sources

### domstol.no — Norwegian Supreme Court (Høyesterett) decisions, post-2021

- **License:** Norwegian-Court-Publication
- **Basis:** Two-part —
  - åndsverkloven §14: court decisions are copyright-exempt at the source-text level
  - domstol.no Supreme Court anonymization regime (effective post-November 2021): all decisions pre-anonymized before web publication
- **Reference URL:** https://www.domstol.no/no/hoyesterett/VERKTOY/avidentifisering/
- **Attribution required:** Cite domstol.no as source
- **Commercial use:** permitted
- **AI training/development:** permitted under copyright exemption + pre-anonymization
- **Coverage v0.1:** Supreme Court decisions published 2021-11 onward (HTML summary body)
- **NOT in scope v0.1:** pre-2021 decisions (anonymization status varies; user-side burden too high)
- **Phase 2:** PDF full-text ingestion (full verbatim decision text, not just HTML summary)

## Code License

The MCP server software (TypeScript code, Dockerfile, ingestion scripts) is licensed under Apache-2.0. See [LICENSE](LICENSE).

The Apache-2.0 code license does not apply to the data — the data carries its own license per the source above.
