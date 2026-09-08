from pathlib import Path

from PIL import Image as PILImage, ImageEnhance
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(r"C:\Users\dev05\Desktop\MarcacionComida\BiometricoLunch-")
TMP = ROOT / "tmp" / "pdfs"
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)

SOURCE_ORDER = Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-f13ce3a8-00af-44e7-9398-9b7b7e4c3ffd.png")
SOURCE_HISTORY = Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-603393d6-88d7-432a-8418-1e574fffab59.png")
ORDER_SHOT = TMP / "pedido_recortado.png"
HISTORY_SHOT = TMP / "historial_recortado.png"
PDF_PATH = OUT / "Manual_usuario_Comedor_Fasani.pdf"
APP_URL = "http://app-comedor-fsn.fasani.local/"

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
INK = HexColor("#071B1B")
DEEP = HexColor("#003B3D")
TEAL = HexColor("#08B9BE")
TEAL_DARK = HexColor("#007E82")
CYAN_PALE = HexColor("#E8FBFB")
MAGENTA = HexColor("#F500AE")
MUTED = HexColor("#587172")
LINE = HexColor("#CBE7E7")
PAPER = HexColor("#F7FBFA")
AMBER = HexColor("#FFF2CC")
AMBER_INK = HexColor("#785500")


def register_fonts():
    fonts = Path(r"C:\Windows\Fonts")
    pdfmetrics.registerFont(TTFont("Segoe", str(fonts / "segoeui.ttf")))
    pdfmetrics.registerFont(TTFont("Segoe-Semibold", str(fonts / "seguisb.ttf")))
    pdfmetrics.registerFont(TTFont("Segoe-Bold", str(fonts / "segoeuib.ttf")))


def prepare_image(source: Path, output: Path):
    image = PILImage.open(source).convert("RGB")
    # Remove the browser and Windows chrome while keeping the complete application view.
    cropped = image.crop((6, 114, image.width - 6, image.height - 50))
    cropped = ImageEnhance.Contrast(cropped).enhance(1.04)
    cropped.save(output, quality=94)


def paragraph(c, text, x, y_top, width, style, height=40 * mm):
    p = Paragraph(text, style)
    _, h = p.wrap(width, height)
    p.drawOn(c, x, y_top - h)
    return h


def rounded(c, x, y, w, h, fill, stroke=None, radius=4 * mm, line_width=0.8):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(line_width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


def pill(c, text, x, y, fill=TEAL, color=INK, width=None):
    c.setFont("Segoe-Semibold", 8.5)
    w = width or c.stringWidth(text, "Segoe-Semibold", 8.5) + 8 * mm
    rounded(c, x, y, w, 8 * mm, fill, radius=4 * mm)
    c.setFillColor(color)
    c.drawCentredString(x + w / 2, y + 2.35 * mm, text)
    return w


def page_footer(c, page):
    c.setStrokeColor(LINE)
    c.line(MARGIN, 11 * mm, PAGE_W - MARGIN, 11 * mm)
    c.setFont("Segoe", 7.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, 6.8 * mm, "Comedor Fasani · Guía rápida para colaboradores")
    c.drawRightString(PAGE_W - MARGIN, 6.8 * mm, f"{page} / 3")


def page_header(c, eyebrow, title, subtitle, page):
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 46 * mm, PAGE_W, 46 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8.5)
    c.drawString(MARGIN, PAGE_H - 14 * mm, eyebrow.upper())
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 23)
    c.drawString(MARGIN, PAGE_H - 25 * mm, title)
    c.setFont("Segoe", 10)
    c.setFillColor(HexColor("#BDE7E6"))
    c.drawString(MARGIN, PAGE_H - 33 * mm, subtitle)
    pill(c, f"PASO {page}", PAGE_W - MARGIN - 25 * mm, PAGE_H - 27 * mm, MAGENTA, white, 25 * mm)


def draw_qr(c, url, x, y, size):
    widget = qr.QrCodeWidget(url)
    bounds = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (bounds[2] - bounds[0]), 0, 0, size / (bounds[3] - bounds[1]), 0, 0])
    drawing.add(widget)
    drawing.drawOn(c, x, y)


def fit_image(c, image_path, x, y, w, h):
    image = PILImage.open(image_path)
    iw, ih = image.size
    ratio = min(w / iw, h / ih)
    dw, dh = iw * ratio, ih * ratio
    c.drawImage(str(image_path), x + (w - dw) / 2, y + (h - dh) / 2, dw, dh, preserveAspectRatio=True, mask="auto")


def numbered_step(c, number, title, body, x, y, width):
    c.setFillColor(TEAL)
    c.circle(x + 5 * mm, y + 8 * mm, 5 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 10)
    c.drawCentredString(x + 5 * mm, y + 6.2 * mm, str(number))
    c.setFont("Segoe-Semibold", 10.5)
    c.drawString(x + 13 * mm, y + 10 * mm, title)
    style = ParagraphStyle("step", fontName="Segoe", fontSize=8.7, leading=11, textColor=MUTED)
    paragraph(c, body, x + 13 * mm, y + 7 * mm, width - 13 * mm, style, 20 * mm)


def build_pdf():
    register_fonts()
    prepare_image(SOURCE_ORDER, ORDER_SHOT)
    prepare_image(SOURCE_HISTORY, HISTORY_SHOT)

    c = canvas.Canvas(str(PDF_PATH), pagesize=A4)
    c.setTitle("Manual de usuario - Comedor Fasani")
    c.setAuthor("Fasani")
    c.setSubject("Guía rápida para reservar y consultar almuerzos")

    # Page 1 - cover / quick start
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(INK)
    c.rect(0, PAGE_H - 104 * mm, PAGE_W, 104 * mm, fill=1, stroke=0)
    c.setFillColor(MAGENTA)
    c.circle(MARGIN + 7 * mm, PAGE_H - 18 * mm, 7 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 12)
    c.drawCentredString(MARGIN + 7 * mm, PAGE_H - 21 * mm, "F")
    c.setFont("Segoe-Bold", 10)
    c.drawString(MARGIN + 18 * mm, PAGE_H - 17 * mm, "COMEDOR")
    c.setFillColor(MAGENTA)
    c.setFont("Segoe-Bold", 7.5)
    c.drawString(MARGIN + 18 * mm, PAGE_H - 22 * mm, "FASANI")

    pill(c, "USO DESDE COMPUTADORA", PAGE_W - MARGIN - 55 * mm, PAGE_H - 23 * mm, DEEP, TEAL, 55 * mm)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 9)
    c.drawString(MARGIN, PAGE_H - 39 * mm, "GUÍA RÁPIDA PARA COLABORADORES")
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 31)
    c.drawString(MARGIN, PAGE_H - 55 * mm, "Tu almuerzo,")
    c.drawString(MARGIN, PAGE_H - 69 * mm, "listo en 2 minutos")
    intro = ParagraphStyle("intro", fontName="Segoe", fontSize=11, leading=15, textColor=HexColor("#CDEAE9"))
    paragraph(c, "Desde la computadora de la empresa puedes reservar toda tu semana y revisar lo que pediste usando tu código de empleado.", MARGIN, PAGE_H - 78 * mm, 140 * mm, intro)

    y = PAGE_H - 119 * mm
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 18)
    c.drawString(MARGIN, y, "Así funciona tu semana")

    flow_y = y - 44 * mm
    rounded(c, MARGIN, flow_y, PAGE_W - 2 * MARGIN, 33 * mm, white, LINE, 4 * mm)
    flow = [
        ("1", "Lunes", "Abre la plataforma"),
        ("2", "Tu código", "Confirma tus datos"),
        ("3", "Lunes a viernes", "Elige hasta 5 platos"),
        ("4", "Guardar", "Revisa y confirma"),
    ]
    flow_w = (PAGE_W - 2 * MARGIN - 12 * mm) / 4
    for i, (num, title, body) in enumerate(flow):
        x = MARGIN + 6 * mm + i * flow_w
        if i < 3:
            c.setStrokeColor(LINE)
            c.setLineWidth(1.2)
            c.line(x + 12 * mm, flow_y + 23 * mm, x + flow_w - 4 * mm, flow_y + 23 * mm)
        c.setFillColor(TEAL if i < 3 else MAGENTA)
        c.circle(x + 6 * mm, flow_y + 23 * mm, 5 * mm, fill=1, stroke=0)
        c.setFillColor(INK if i < 3 else white)
        c.setFont("Segoe-Bold", 9)
        c.drawCentredString(x + 6 * mm, flow_y + 20.8 * mm, num)
        c.setFillColor(INK)
        c.setFont("Segoe-Semibold", 9.3)
        c.drawString(x, flow_y + 12 * mm, title)
        c.setFillColor(MUTED)
        c.setFont("Segoe", 7.4)
        c.drawString(x, flow_y + 6 * mm, body)

    feature_y = flow_y - 54 * mm
    gap = 6 * mm
    feature_w = (PAGE_W - 2 * MARGIN - gap) / 2
    card_style = ParagraphStyle("card", fontName="Segoe", fontSize=9, leading=12, textColor=MUTED)
    features = [
        (CYAN_PALE, "01 · PRIMERO", "Solicita tu comida", "Elige un plato para cada día que necesites. El máximo es <b>5 almuerzos por semana: uno por día</b>. También puedes dejar días sin pedido."),
        (white, "02 · DESPUÉS", "Consulta lo que pediste", "Revisa cada fecha, el plato seleccionado, la cantidad y si aparece como <b>Entregado</b> o <b>Pendiente</b>."),
    ]
    for i, (fill, eyebrow, title, body) in enumerate(features):
        x = MARGIN + i * (feature_w + gap)
        rounded(c, x, feature_y, feature_w, 45 * mm, fill, LINE, 4 * mm)
        c.setFillColor(TEAL_DARK)
        c.setFont("Segoe-Bold", 8)
        c.drawString(x + 6 * mm, feature_y + 35 * mm, eyebrow)
        c.setFillColor(INK)
        c.setFont("Segoe-Bold", 13)
        c.drawString(x + 6 * mm, feature_y + 26 * mm, title)
        paragraph(c, body, x + 6 * mm, feature_y + 20 * mm, feature_w - 12 * mm, card_style, 20 * mm)

    rounded(c, MARGIN, 31 * mm, PAGE_W - 2 * MARGIN, 33 * mm, DEEP, radius=4 * mm)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8)
    c.drawString(MARGIN + 6 * mm, 55 * mm, "ACCESO DESDE LA COMPUTADORA DE LA EMPRESA")
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 11)
    c.drawString(MARGIN + 6 * mm, 46 * mm, APP_URL)
    c.linkURL(APP_URL, (MARGIN + 5 * mm, 40 * mm, PAGE_W - MARGIN - 5 * mm, 58 * mm), relative=0)
    c.setFont("Segoe", 8.5)
    c.setFillColor(HexColor("#CDEAE9"))
    c.drawString(MARGIN + 6 * mm, 37 * mm, "No necesitas iniciar sesión. Guarda el enlace en Favoritos para encontrarlo cada lunes.")
    page_footer(c, 1)
    c.showPage()

    # Page 2 - ordering
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    page_header(c, "Reservar", "Encarga tu comida", "Selecciona toda la semana: máximo 5 almuerzos, uno por cada día laboral.", 2)
    shot_y = PAGE_H - 148 * mm
    rounded(c, MARGIN, shot_y, PAGE_W - 2 * MARGIN, 94 * mm, white, LINE, 4 * mm)
    fit_image(c, ORDER_SHOT, MARGIN + 2 * mm, shot_y + 2 * mm, PAGE_W - 2 * MARGIN - 4 * mm, 90 * mm)

    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 16)
    c.drawString(MARGIN, shot_y - 12 * mm, "Cuatro pasos y listo")
    col_w = (PAGE_W - 2 * MARGIN - 7 * mm) / 2
    numbered_step(c, 1, "Abre “Encargar comida”", "La pantalla mostrará la semana disponible y la hora exacta de cierre.", MARGIN, shot_y - 40 * mm, col_w)
    numbered_step(c, 2, "Ingresa tu código", "Pulsa <b>Continuar</b> y confirma que aparezcan tu nombre y departamento.", MARGIN + col_w + 7 * mm, shot_y - 40 * mm, col_w)
    numbered_step(c, 3, "Marca una opción por día", "Puedes pedir hasta <b>5 en la semana: uno por día</b>. Si no deseas almuerzo, usa <b>No pedir comida este día</b>.", MARGIN, shot_y - 68 * mm, col_w)
    numbered_step(c, 4, "Guarda y confirma", "Revisa el resumen final. El mensaje verde confirma que tus comidas quedaron guardadas.", MARGIN + col_w + 7 * mm, shot_y - 68 * mm, col_w)

    rounded(c, MARGIN, 24 * mm, PAGE_W - 2 * MARGIN, 21 * mm, AMBER, radius=4 * mm)
    c.setFillColor(AMBER_INK)
    c.setFont("Segoe-Bold", 9.5)
    c.drawString(MARGIN + 6 * mm, 37 * mm, "¿Necesitas cambiar algo después del cierre?")
    c.setFont("Segoe", 8.5)
    c.drawString(MARGIN + 6 * mm, 29 * mm, "Comunícate con Recursos Humanos. Un colaborador no puede modificar pedidos cerrados.")
    page_footer(c, 2)
    c.showPage()

    # Page 3 - consultation and rules
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    page_header(c, "Consultar", "Revisa tu historial", "Comprueba qué pediste, qué retiraste y qué quedó pendiente.", 3)
    shot_y = PAGE_H - 148 * mm
    rounded(c, MARGIN, shot_y, PAGE_W - 2 * MARGIN, 94 * mm, white, LINE, 4 * mm)
    fit_image(c, HISTORY_SHOT, MARGIN + 2 * mm, shot_y + 2 * mm, PAGE_W - 2 * MARGIN - 4 * mm, 90 * mm)

    body_style = ParagraphStyle("body", fontName="Segoe", fontSize=8.5, leading=11, textColor=MUTED)
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 15)
    c.drawString(MARGIN, shot_y - 12 * mm, "Cómo consultar")
    numbered_step(c, 1, "Entra en “Consulta”", "Selecciona <b>Últimas 4 semanas</b> o un <b>Período de fechas</b>.", MARGIN, shot_y - 39 * mm, 82 * mm)
    numbered_step(c, 2, "Escribe tu código", "Pulsa el botón de consulta. Verás qué pediste, la cantidad por fecha y el total del período.", MARGIN, shot_y - 65 * mm, 82 * mm)

    box_x = MARGIN + 92 * mm
    box_w = PAGE_W - MARGIN - box_x
    rounded(c, box_x, shot_y - 72 * mm, box_w, 63 * mm, white, LINE, 4 * mm)
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 12)
    c.drawString(box_x + 6 * mm, shot_y - 20 * mm, "Lo importante")
    bullets = [
        ("E", "Entregado", "Almuerzo retirado en el comedor."),
        ("P", "Pendiente", "Fue reservado, pero no se registró su entrega."),
        ("$", "Cobro", "Todos los platos reservados cuentan, incluso los pendientes."),
    ]
    by = shot_y - 31 * mm
    for symbol, title, body in bullets:
        c.setFillColor(TEAL if symbol != "$" else MAGENTA)
        c.circle(box_x + 9 * mm, by + 1.5 * mm, 3.5 * mm, fill=1, stroke=0)
        c.setFillColor(INK if symbol != "$" else white)
        c.setFont("Segoe-Bold", 8)
        c.drawCentredString(box_x + 9 * mm, by - 0.5 * mm, symbol)
        c.setFillColor(INK)
        c.setFont("Segoe-Semibold", 9)
        c.drawString(box_x + 16 * mm, by + 2.5 * mm, title)
        paragraph(c, body, box_x + 16 * mm, by, box_w - 22 * mm, body_style, 10 * mm)
        by -= 15 * mm

    rounded(c, MARGIN, 24 * mm, PAGE_W - 2 * MARGIN, 25 * mm, DEEP, radius=4 * mm)
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 10)
    c.drawString(MARGIN + 6 * mm, 40 * mm, "Recuerda")
    c.setFont("Segoe", 8.3)
    c.setFillColor(HexColor("#CDEAE9"))
    c.drawString(MARGIN + 6 * mm, 32 * mm, "Para correcciones, transferencias o solicitudes fuera de horario, contacta a Recursos Humanos.")
    page_footer(c, 3)
    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build_pdf()
