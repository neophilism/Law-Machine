# Coverage and capability declarations (LM-007)

The legislation package evaluates **explicit authored coverage** of a pinned bill version. It does not infer the effect of law or claim jurisdiction-wide coverage. A declaration maps each provision ID in that version to one of four statuses: \`modeled\`, \`explanatory-only\`, \`ambiguous\`, \`unsupported\`. Reasons are mandatory for ambiguous and unsupported items. Unmapped provisions are reported, never counted as covered.

A pack declares required operation, calendar and domain capability IDs. The host declares support separately. \`assessCoverage\` rejects invalid or duplicate mappings, missing or malformed baseline dates, invalid models, undeclared rule operations and unsupported capability requirements. It reports \`completeWithinDeclaredScope\` only if all provisions within the specified version are explicitly modeled and every required capability is supported. This does **not** mean that all law, behavior or implementation circumstances are modeled.

The assessment always returns public disclosure strings sourced from the pinned bill version: legislative status, baseline date, hypothetical scenario status and partial coverage. Scene/view controls cannot remove these labels by changing presentation state. An enacted status in an authored pack is labeled "Recorded as enacted — verify official version"; it is never taken as proof of currently applicable law. A draft/introduced version is explicitly not enacted.

The public browser will later consume these pure source-linked declarations. The initial toy fixture is fictional. The engine does not execute unsupported legal operations. Actual rule parsing, calendars, simulation and audit trails are subsequent milestones.

No credentials, network access, model provider, database, storage or real filing data are required. Unknowns and conflicts remain visible and fail closed for complete execution.
