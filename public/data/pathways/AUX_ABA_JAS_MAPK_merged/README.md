# AUX+ABA+JASMONATE+MAPK Merged Pathway

## Source
This pathway integrates three KEGG pathways related to plant hormone signaling:
- **ath04075**: Plant hormone signal transduction (Auxin + ABA)
- **ath04016**: MAPK signaling pathway
- Merged subpathways for: **Auxin**, **ABA (Abscisic Acid)**, and **Jasmonate**

## Data Files

### nodes.tsv
Contains 47 nodes representing:
- **Genes**: Signaling proteins, transcription factors, receptors
- **Compounds**: Hormones (IAA, ABA, Jasmonate), H2O2, DNA
- **Processes**: Biological outcomes (plant growth, stomatal closure, stress adaptation)

Key pathways represented:
- `auxin`: Auxin signaling nodes
- `aba`: ABA signaling nodes
- `NA` or `4016`: MAPK signaling and jasmonate-related nodes
- `4075`: Jasmonate-specific nodes

### edges.tsv
Contains 53 edges representing regulatory relationships:
- **PPrel** (Protein-Protein Relation): Direct protein interactions
- **GErel** (Gene Expression Relation): Transcriptional regulation
- **PCrel** (Protein-Compound Relation): Protein-metabolite interactions

Regulation types:
- `activation`: Positive regulation (→)
- `repression`: Negative regulation (⊣)
- `other`: Neutral or indirect relationships

### content.tsv
Contains 308 gene-to-node mappings linking Arabidopsis gene IDs (AT#G#####) to pathway nodes.
This file enables the connection between regulatory data (TF→target interactions) and pathway visualization.

## Integration with Regulatory Data

When a transcription factor (TF) is selected in the application:
1. The system loads TF→target interactions from `dap.tsv`, `chip.tsv`, `target.tsv`
2. It matches regulated gene IDs with genes in `content.tsv`
3. Nodes containing regulated genes are highlighted in the pathway visualization
4. This shows which parts of the hormone signaling pathway are potentially regulated by the selected TF

## Visualization Features

- **Node highlighting**: Genes with regulatory data glow with emerald borders
- **Edge coloring**:
  - Green: Activation
  - Red: Repression
  - Gray: Unknown/Other
- **Interactive tooltips**: Hover over nodes to see gene lists and regulation status
- **Pathway context**: Nodes are color-coded by pathway origin (auxin, aba, jasmonate/MAPK)

## Original Data
Source files located at:
`/home/lahumada/disco1/KEGG/Ath_04075_Plant_Hormone_st/auxin_aba_4075_aba_4016_jasmonate_4075_4016/`

- `full_network_nodes.tsv` → transformed to `nodes.tsv`
- `full_network_edges.tsv` → transformed to `edges.tsv`
- `full_network_mapping.tsv` → transformed to `content.tsv`
- `full_network_subpathway.graphml` → source GraphML file
- `full_network_subpathway.png` → copied to `pathway_diagram.png`

Generated on: 2026-02-04
