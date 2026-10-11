import zipfile
import xml.etree.ElementTree as ET
import os
import sys

docx_path = r"C:\Users\AMINE\Desktop\angular\OpenWA\rapport_project\PFE-Supmanagment-PayPark.docx"

if not os.path.exists(docx_path):
    print(f"File not found: {docx_path}")
    sys.exit(1)

with zipfile.ZipFile(docx_path) as z:
    for name in z.namelist():
        if name.endswith('.xml'):
            print(f"Entry: {name}")

    xml_content = z.read('word/document.xml')
    tree = ET.fromstring(xml_content)

    # Namespaces
    namespaces = {
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    }

    paragraphs = []
    headings = []

    for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        # Check style
        pStyle = p.find('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pStyle')
        style_val = pStyle.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') if pStyle is not None else None

        texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
        full_text = "".join(texts).strip()

        if full_text:
            paragraphs.append((style_val, full_text))
            if style_val and any(h in style_val.lower() for h in ['heading', 'titre']):
                headings.append((style_val, full_text))
            elif any(full_text.lower().startswith(x) for x in ['chapitre', 'introduction', 'conclusion', 'remerciement', 'résumé', 'sommaire', 'table des']):
                headings.append((style_val or 'manual', full_text))

    print(f"\nTotal non-empty paragraphs: {len(paragraphs)}")
    print(f"\nDetected headings / key sections ({len(headings)}):")
    for s, h in headings[:50]:
        print(f"  [{s}] {h}")

    output_txt = r"C:\Users\AMINE\Desktop\angular\OpenWA\rapport_project\extracted_text.txt"
    with open(output_txt, "w", encoding="utf-8") as out:
        for s, p in paragraphs:
            out.write(f"[{s or 'Normal'}] {p}\n")

    print(f"\nFull text dumped to {output_txt}")
