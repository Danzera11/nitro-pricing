# Nitro Pricing - Historical Proposal Modeling

This file records how the historical proposal PDFs were used as internal modeling references.

The PDFs are not client-facing templates. They were used to derive default service structure, rules, risk language, and AI behavior.

## Patterns Extracted

- Proposals usually start from a technical context and then list services to execute.
- Pricing is focused on specialized labor.
- Materials, equipment and devices are frequently excluded from pricing.
- Some proposals include a preliminary material list only as a reference for acquisition.
- Services appear as operational blocks: cable launching, network point identification, rack organization, camera installation, fiber launching, fiber fusion, access point installation, alarm/sensor work, and external infrastructure.

## Rules Added

- Nitro Pricing calculates labor only.
- Materials are suggested with quantity and unit only.
- Network projects with many points should consider mapping and identification.
- Fiber projects should consider launching, fusion, rack organization and validation.
- Access point work should consider installation, cabling, crimping and configuration.
- Outdoor or height work should raise PTA/platform/post/infrastructure risks.
- Non-business-hours execution should be treated as a special premise.

## Service Base Expanded

- Network point installation and certification
- Cable launching by point and by meter
- Cable identification and mapping
- Rack installation and organization
- Camera installation and NVR configuration
- CFTV infrastructure
- Optical fiber launching, fusion and validation
- Access point installation/configuration
- Alarm/sensor installation
- External infrastructure, poles, conduits and height work

## AI Behavior

The active AI prompt now lives in the database and can be edited in the AI Control Center. The prompt instructs the AI to use these historical patterns as internal reasoning guidance while keeping the output as an internal technical/commercial quote view.
