# Privacy & Client Confidentiality

**CRITICAL READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Den Norske Advokatforening (Norwegian Bar Association) rules and Norwegian data protection law.

---

## Executive Summary for Legal Professionals

**Key Risks:**
- Queries flow through Claude API infrastructure (Anthropic cloud)
- Query content may reveal client matters and privileged information
- Advokatforeningen rules require strict data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **On-Premise Deployment**: Self-host with local LLM for privileged matters (see below)
3. **Anonymization**: Remove all client-identifying information from queries

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with Claude:

```
User Query → MCP Client (Claude Desktop/API) → Anthropic Cloud → MCP Server (This Tool) → Database
```

**What This Means:**

1. **Queries Transit Anthropic Infrastructure**: Your queries are sent to Anthropic's servers for LLM processing
2. **Query Logging**: Anthropic may log queries subject to their [Privacy Policy](https://www.anthropic.com/legal/privacy)
3. **Tool Responses**: Database responses return through the same path
4. **No Direct Control**: You do not control Anthropic's data processing, retention, or security practices

### What Gets Transmitted

When you use this Tool through Claude Desktop or API:

- **Query Text**: The full text of your search queries
- **Tool Parameters**: Document IDs, provision references, filters, date ranges
- **Tool Responses**: Statute text, cross-references
- **Metadata**: Timestamps, user agent, API keys (handled by Anthropic)

**What Does NOT Get Transmitted:**
- Direct database access (Tool runs locally, queries Anthropic only for LLM processing)
- Files on your computer
- Your full conversation history (unless using Claude.ai web interface)

---

## Legal Professional Obligations

### Advokatforeningen (Norwegian Bar Association) Rules

Norwegian lawyers are bound by **strict confidentiality rules** under Domstolloven § 224 and the Advokatforskriften (Regulation on Lawyers). Den Norske Advokatforening's Code of Conduct (Regler for god advokatskikk) imposes professional confidentiality obligations.

#### Taushetsplikt (Duty of Confidentiality)

**Applies to:**
- All client communications
- Client identity (in sensitive matters)
- Case strategy and legal analysis
- Information that could identify client or matter

**Consequences of Breach:**
- Professional disciplinary action (Advokatbevillingsnemnden)
- Suspension or loss of licence
- Civil liability to client
- Criminal liability (in extreme cases, Straffeloven § 211)

### GDPR and Personopplysningsloven

Norway implemented the GDPR through Personopplysningsloven (LOV-2018-06-15-38) via the EEA Agreement. When you use a service that processes client data:

- You are the **Data Controller** (behandlingsansvarlig)
- Anthropic is a **Data Processor** (databehandler)
- A **Data Processing Agreement (DPA)** (databehandleravtale) is required under Personopplysningsloven § 13 / GDPR Article 28
- You must ensure adequate technical and organisational measures

**Supervisory Authority:** Datatilsynet (Norwegian Data Protection Authority) — [datatilsynet.no](https://www.datatilsynet.no/)

**Do You Have a DPA with Anthropic?**
- Check [Anthropic's Commercial Terms](https://www.anthropic.com/legal/commercial-terms) for DPA coverage
- Confirm whether Anthropic's terms meet your obligations under Personopplysningsloven
- Consider whether client consent is required for third-party processing

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through Claude API:**

```
Example Query: "What does Personopplysningsloven § 5 say about data minimisation?"
```

- No client identity
- No case-specific facts
- No privileged strategy
- Publicly available legal information

### MEDIUM RISK: Anonymized Client Matters

**Use with caution:**

```
Example Query: "What are the penalties under Straffeloven for insider trading?"
```

**Risks:**
- Query pattern may reveal you're working on an insider trading matter
- Anthropic logs may link query to your API key → your practice → your clients

**Mitigation:**
- Remove ALL identifying details
- Use general terms, not case-specific facts
- Consider whether even the legal area is sensitive

### HIGH RISK: Client-Specific Queries

**DO NOT USE through Claude API:**

```
Bad Example: "Find precedents for custody disputes involving allegations of substance abuse in Bergen"
```

**Why This is Dangerous:**
- Geographic specificity
- Case-specific facts
- May reveal client identity or confidential strategy
- May violate Advokatforeningen rules even if client name not mentioned

**What to do instead:**
- Use lovdata.no (full subscription) or Rettsdata with appropriate DPAs
- Use on-premise deployment (see below)
- Conduct manual research through official channels

---

## On-Premise Deployment

For **privileged legal matters**, deploy this Tool with a **self-hosted LLM** to eliminate external data transmission.

### Architecture

```
User Query → Local MCP Client → Local LLM (no external API) → MCP Server (This Tool) → Local Database
```

**Benefits:**
- No query data sent to Anthropic or any external service
- Full control over logging and data retention
- Compliant with Advokatforeningen confidentiality rules
- Compliant with Personopplysningsloven (no third-party data processors)

### Self-Hosted LLM Options

| Solution | Complexity | Model Quality | Cost |
|----------|------------|---------------|------|
| **Ollama** (local) | Low | Medium (Llama 3.1) | Free (hardware only) |
| **LM Studio** (local) | Low | Medium-High | Free (hardware only) |
| **OpenLLM** (local/cloud) | Medium | High (custom models) | Variable |
| **vLLM** (self-hosted cloud) | High | High (latest models) | Server costs |

### Hardware Requirements

For acceptable performance with a 70B parameter model:

- **GPU**: NVIDIA A100 (80GB) or H100 (recommended)
- **RAM**: 128GB+ system RAM
- **Storage**: 200GB+ SSD for models and database
- **Fallback**: Use smaller models (7B-13B) on consumer GPU (RTX 4090)

### Setup Guide

1. **Install Ollama** (easiest option):
   ```bash
   # macOS/Linux
   curl -fsSL https://ollama.ai/install.sh | sh

   # Pull a model
   ollama pull llama3.1:70b
   ```

2. **Configure MCP to use Ollama**:
   ```json
   {
     "mcpServers": {
       "norwegian-law": {
         "command": "npx",
         "args": ["-y", "@ansvar/norwegian-law-mcp"],
         "env": {
           "ANTHROPIC_API_KEY": "local",
           "LOCAL_LLM": "ollama",
           "LOCAL_LLM_MODEL": "llama3.1:70b"
         }
       }
     }
   }
   ```

3. **Deploy Database Locally**:
   - Database is already local (SQLite file)
   - Ensure `data/database.db` is on encrypted disk
   - Run updates locally (`npm run check-updates`)

### Cloud Deployment (Private VPC)

For law firms requiring cloud scalability with confidentiality:

1. **Deploy to Private AWS VPC or Azure VNet**
2. **Use Private Link/Private Endpoint** for all services
3. **Self-hosted LLM** on EC2/VM (no external LLM APIs)
4. **Encrypted Database** with KMS-managed keys
5. **Network Isolation** — no internet access, internal-only endpoints
6. **Audit Logging** — CloudTrail/Azure Monitor for compliance

**Estimated Cost**: €500–2000/month depending on usage and instance sizes

---

## Query Logging and Data Retention

### Anthropic's Data Practices

Per [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy):

- **API Queries**: May be logged for abuse prevention and model improvement
- **Retention Period**: Check current policy (subject to change)
- **Opt-Out**: Commercial/Enterprise plans may have different retention terms
- **Zero Data Retention (ZDR)**: Available for some Enterprise customers

**ACTION REQUIRED**: Review Anthropic's current policy and negotiate ZDR if needed for professional use.

### This Tool's Data Practices

**Local Data (Not Transmitted):**
- **Database**: Stored locally, never transmitted
- **Query History**: NOT logged by this Tool
- **User Data**: No personal data collected or stored

**Transmitted Data (via Anthropic):**
- Query text and tool parameters (logged per Anthropic policy)
- Tool responses (logged per Anthropic policy)

---

## NLOD 2.0 and Data License

The legal data served by this Tool is licensed under NLOD 2.0 (Norwegian Licence for Open Government Data). NLOD 2.0 permits free reuse including commercial use and AI development. See [DATA_LICENSES.md](DATA_LICENSES.md) for attribution requirements.

NLOD 2.0 is separate from personal data protection rules. Using this Tool to process queries about clients still requires compliance with Personopplysningsloven and GDPR regardless of the data license on the legal corpus.

---

## Recommendations by User Type

### Solo Practitioners / Small Firms

1. **General Research**: Use Claude API for non-client-specific research
2. **Client Matters**: Use lovdata.no (full subscription) or manual research
3. **Budget Option**: Deploy locally with Ollama for confidential queries
4. **Document Queries**: Keep query log to assess confidentiality risks monthly

### Large Firms / Corporate Legal Departments

1. **Enterprise DPA**: Negotiate Data Processing Agreement with Anthropic
2. **Zero Data Retention**: Require ZDR or minimal retention in DPA
3. **On-Premise Deployment**: Deploy privately hosted LLM infrastructure
4. **Information Security Audit**: Conduct personvernkonsekvensvurdering (DPIA) per Personopplysningsloven § 24
5. **Staff Training**: Train lawyers on safe vs. unsafe queries

### Government / Public Sector

1. **Security Classification**: Treat all government legal work as confidential
2. **On-Premise Required**: Use self-hosted deployment, no external APIs
3. **NSM Guidelines**: Follow Nasjonal sikkerhetsmyndighet guidelines for AI tool use
4. **Procurement Compliance**: Follow public procurement rules (Anskaffelsesloven) for LLM infrastructure

---

## Client Consent and Disclosure

### Do You Need Client Consent?

Under Personopplysningsloven and professional ethics rules, consider whether you need **informed client consent** before using AI tools:

**Factors Requiring Consent:**
- Client data is transmitted to third-party processor (Anthropic)
- AI tool use may affect legal strategy or case outcome
- Client has reasonable expectation of confidentiality

**Recommended Practice:**
- Update engagement letters (oppdragsbekreftelse) to disclose AI tool use
- Provide clients with information about data processing
- Offer opt-out for clients who object to AI use
- Document client consent in the matter file

### Professional Disclosure

**Norway**: No specific AI disclosure requirement in Advokatforskriften as of 2026, but regler for god advokatskikk (principle of transparency) may require disclosure to clients. Consult Advokatforeningen's ethics committee for current guidance.

---

## Security Best Practices

### Minimum Security Measures

1. **API Key Protection**: Store Anthropic API keys in secure vault, never in code
2. **Encrypted Storage**: Database file on encrypted disk (FileVault, BitLocker, LUKS)
3. **Access Control**: Limit database file permissions to your user account only
4. **Network Security**: Use VPN or private network if accessing remote MCP server
5. **Audit Trail**: Log when and how Tool is used for client matters

### Red Flags — Stop Using Immediately If:

- API keys committed to Git or shared in communication tools
- Database file accessible to other users on shared computer
- Queries include client names, case numbers, or identifying information
- No Data Processing Agreement with Anthropic for client data
- Using personal Claude.ai account (web interface) for client work

---

## Compliance Checklist

### Before Using for Professional Legal Work

- [ ] Read and understood [DISCLAIMER.md](DISCLAIMER.md)
- [ ] Reviewed Anthropic Privacy Policy and Terms
- [ ] Determined whether databehandleravtale is required under Personopplysningsloven § 13
- [ ] Assessed whether client consent is needed
- [ ] Decided on deployment model (Cloud API vs. On-Premise)
- [ ] Trained staff on confidential vs. non-confidential queries
- [ ] Updated oppdragsbekreftelse to disclose AI tool use (if required)
- [ ] Established query anonymisation procedures
- [ ] Documented decision to use Tool in risk management records

---

## Questions and Support

### Privacy Questions

For questions about privacy and confidentiality:

1. **Anthropic Privacy**: Contact privacy@anthropic.com
2. **Advokatforeningen Guidance**: Consult Advokatforeningens etikkutvalg (ethics committee)
3. **Datatilsynet**: For GDPR/Personopplysningsloven interpretation — [datatilsynet.no](https://www.datatilsynet.no/)
4. **Tool-Specific**: Open issue on [GitHub](https://github.com/Ansvar-Systems/norwegian-law-mcp/issues)

### Incident Reporting

If you suspect a confidentiality breach (e.g., accidentally queried client name):

1. **Document Incident**: Record what information was transmitted and when
2. **Notify Client**: Inform affected client under Personopplysningsloven § 19 / GDPR Article 34 breach notification rules
3. **Contact Anthropic**: Request deletion of query logs (if possible)
4. **Datatilsynet**: Report to Datatilsynet if personal data breach under Personopplysningsloven § 33 / GDPR Article 33
5. **Advokatforeningen**: Report to Advokatforeningen if professional rules may have been breached

---

## Changes to This Policy

This privacy notice may be updated as:
- Anthropic changes their data practices
- New professional ethics guidance emerges
- Tool deployment options expand

Check [GitHub repository](https://github.com/Ansvar-Systems/norwegian-law-mcp) for current version.

---

**Last Updated**: 2026-05-02
**Tool Version**: 0.1.0

---

## Summary: Safe Use Guidelines

**DO**: Use for general, non-client-specific legal research
**DO**: Deploy on-premise for privileged client matters
**DO**: Anonymise queries and remove all client identifiers
**DO**: Obtain client consent if required by professional rules
**DO**: Document AI tool use and confidentiality assessments

**DON'T**: Include client names, case numbers, or identifying facts in queries
**DON'T**: Use for sensitive matters without on-premise deployment
**DON'T**: Assume Anthropic's standard terms meet your Personopplysningsloven obligations
**DON'T**: Use personal Claude.ai account for professional legal work
**DON'T**: Forget that query patterns may reveal confidential information even without explicit identifiers
