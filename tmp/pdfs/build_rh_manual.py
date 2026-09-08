from pathlib import Path

from PIL import Image as PILImage, ImageEnhance
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(r"C:\Users\dev05\Desktop\MarcacionComida\BiometricoLunch-")
TMP = ROOT / "tmp" / "pdfs" / "rh"
OUT = ROOT / "output" / "pdf"
TMP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "menu": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-86d77ceb-6228-4b15-b02d-fa0fd7bee63c.png"),
    "modify": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-e865fb4f-0e89-40cb-9862-90d6481e0b2b.png"),
    "transfer": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-a64ff1cd-fe88-4c22-9e0c-bf0c4f2412c8.png"),
    "reports": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-3af56810-ef69-43b5-8403-b133cc4774a8.png"),
    "employees": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-c5f92ea7-0fd4-42d3-88c1-1e09564fe54c.png"),
}
IMAGES = {name: TMP / f"{name}.png" for name in SOURCES}
PDF_PATH = OUT / "Manual_Recursos_Humanos_Comedor_Fasani.pdf"
APP_URL = "http://app-comedor-fsn.fasani.local/"

W, H = landscape(A4)
M = 14 * mm
INK = HexColor("#061C1C")
DEEP = HexColor("#003B3D")
TEAL = HexColor("#08B9BE")
TEAL_DARK = HexColor("#007F83")
PALE = HexColor("#E8FAF9")
PAPER = HexColor("#F5FAF9")
LINE = HexColor("#C4E4E3")
MUTED = HexColor("#557273")
MAGENTA = HexColor("#F500AE")
PLUM = HexColor("#6A0C62")
AMBER = HexColor("#FFF2CE")
AMBER_INK = HexColor("#725100")
RED_PALE = HexColor("#FFE7F7")


def fonts():
    base = Path(r"C:\Windows\Fonts")
    pdfmetrics.registerFont(TTFont("Segoe", str(base / "segoeui.ttf")))
    pdfmetrics.registerFont(TTFont("Segoe-Semibold", str(base / "seguisb.ttf")))
    pdfmetrics.registerFont(TTFont("Segoe-Bold", str(base / "segoeuib.ttf")))


def prepare_images():
    for name, source in SOURCES.items():
        image = PILImage.open(source).convert("RGB")
        # Elimina barras del navegador y del sistema sin perder la navegación de la aplicación.
        top = 114 if image.height > 1050 else 94
        bottom = 49 if image.height > 1050 else 8
        image = image.crop((5, top, image.width - 5, image.height - bottom))
        image = ImageEnhance.Contrast(image).enhance(1.04)
        image.save(IMAGES[name], quality=95)


def rounded(c, x, y, w, h, fill, stroke=None, radius=3.5 * mm, width=0.7):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


def para(c, text, x, top, width, style, max_h=35 * mm):
    p = Paragraph(text, style)
    _, height = p.wrap(width, max_h)
    p.drawOn(c, x, top - height)
    return height


BODY = ParagraphStyle("body", fontName="Segoe", fontSize=8.2, leading=10.6, textColor=MUTED)
BODY_DARK = ParagraphStyle("body_dark", parent=BODY, textColor=INK)
SMALL = ParagraphStyle("small", fontName="Segoe", fontSize=7.2, leading=9.2, textColor=MUTED)
WHITE_BODY = ParagraphStyle("white", fontName="Segoe", fontSize=8.5, leading=11, textColor=HexColor("#CDEAE9"))


def fit_image(c, path, x, y, w, h):
    image = PILImage.open(path)
    iw, ih = image.size
    ratio = min(w / iw, h / ih)
    dw, dh = iw * ratio, ih * ratio
    c.drawImage(str(path), x + (w - dw) / 2, y + (h - dh) / 2, dw, dh,
                preserveAspectRatio=True, mask="auto")


def footer(c, page):
    c.setStrokeColor(LINE)
    c.line(M, 10 * mm, W - M, 10 * mm)
    c.setFillColor(MUTED)
    c.setFont("Segoe", 7.2)
    c.drawString(M, 5.8 * mm, "Comedor Fasani - Manual operativo de Recursos Humanos")
    c.drawCentredString(W / 2, 5.8 * mm, APP_URL)
    c.linkURL(APP_URL, (W / 2 - 37 * mm, 3.5 * mm, W / 2 + 37 * mm, 9 * mm), relative=0)
    c.drawRightString(W - M, 5.8 * mm, f"{page} / 6")


def header(c, step, title, subtitle, page):
    c.setFillColor(INK)
    c.rect(0, H - 31 * mm, W, 31 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8)
    c.drawString(M, H - 10 * mm, step.upper())
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 21)
    c.drawString(M, H - 21 * mm, title)
    c.setFillColor(HexColor("#BEE7E6"))
    c.setFont("Segoe", 8.8)
    c.drawString(M + 95 * mm, H - 20.5 * mm, subtitle)
    rounded(c, W - M - 27 * mm, H - 22.5 * mm, 27 * mm, 9 * mm, MAGENTA, radius=4.5 * mm)
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 8)
    c.drawCentredString(W - M - 13.5 * mm, H - 19.7 * mm, f"PASO {page - 1}")


def screenshot(c, key):
    y = 74 * mm
    rounded(c, M, y, W - 2 * M, 98 * mm, white, LINE, 4 * mm)
    fit_image(c, IMAGES[key], M + 2 * mm, y + 2 * mm, W - 2 * M - 4 * mm, 94 * mm)
    return y


def info_card(c, x, y, w, h, number, title, body, fill=white, accent=TEAL):
    rounded(c, x, y, w, h, fill, LINE, 3.5 * mm)
    c.setFillColor(accent)
    c.circle(x + 7 * mm, y + h - 8 * mm, 4 * mm, fill=1, stroke=0)
    c.setFillColor(INK if accent != MAGENTA else white)
    c.setFont("Segoe-Bold", 8)
    c.drawCentredString(x + 7 * mm, y + h - 10.2 * mm, str(number))
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 10.2)
    c.drawString(x + 14 * mm, y + h - 10.5 * mm, title)
    para(c, body, x + 6 * mm, y + h - 16 * mm, w - 12 * mm, BODY, h - 18 * mm)


def three_cards(c, cards):
    gap = 5 * mm
    y, h = 18 * mm, 48 * mm
    width = (W - 2 * M - 2 * gap) / 3
    for i, card in enumerate(cards):
        info_card(c, M + i * (width + gap), y, width, h, *card)


def build():
    fonts()
    prepare_images()
    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle("Manual de Recursos Humanos - Comedor Fasani")
    c.setAuthor("Fasani")
    c.setSubject("Operación semanal, excepciones, transferencias, reportes y empleados")

    # 1. Portada y mapa operativo
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(INK)
    c.rect(0, H - 94 * mm, W, 94 * mm, fill=1, stroke=0)
    c.setFillColor(MAGENTA)
    c.circle(M + 7 * mm, H - 17 * mm, 7 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 12)
    c.drawCentredString(M + 7 * mm, H - 20.5 * mm, "F")
    c.setFont("Segoe-Bold", 10)
    c.drawString(M + 18 * mm, H - 16 * mm, "COMEDOR")
    c.setFillColor(MAGENTA)
    c.setFont("Segoe-Bold", 7.3)
    c.drawString(M + 18 * mm, H - 21 * mm, "FASANI")
    rounded(c, W - M - 48 * mm, H - 22 * mm, 48 * mm, 9 * mm, DEEP, radius=4.5 * mm)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 7.6)
    c.drawCentredString(W - M - 24 * mm, H - 19.2 * mm, "RECURSOS HUMANOS")
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8.5)
    c.drawString(M, H - 37 * mm, "MANUAL OPERATIVO - GUÍA RÁPIDA")
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 29)
    c.drawString(M, H - 53 * mm, "Del menú semanal")
    c.drawString(M, H - 67 * mm, "al reporte final")
    para(c, "Qué hacer en cada situación para mantener los pedidos claros, actualizados y auditados.",
         M, H - 76 * mm, 145 * mm, WHITE_BODY)

    # Ruta visual
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 15)
    c.drawString(M, H - 108 * mm, "La ruta de RH en cinco momentos")
    flow_y = H - 148 * mm
    gap = 4 * mm
    fw = (W - 2 * M - 4 * gap) / 5
    flows = [
        ("1", "Planificar", "Crear y publicar el menú"),
        ("2", "Resolver", "Agregar, cambiar o cancelar"),
        ("3", "Transferir", "Asignar a otro beneficiario"),
        ("4", "Informar", "Descargar reportes Excel"),
        ("5", "Mantener", "Administrar empleados"),
    ]
    for i, (n, title, body) in enumerate(flows):
        x = M + i * (fw + gap)
        rounded(c, x, flow_y, fw, 31 * mm, white, LINE, 3.5 * mm)
        c.setFillColor(TEAL if i < 4 else MAGENTA)
        c.circle(x + 7 * mm, flow_y + 22 * mm, 4.2 * mm, fill=1, stroke=0)
        c.setFillColor(INK if i < 4 else white)
        c.setFont("Segoe-Bold", 8)
        c.drawCentredString(x + 7 * mm, flow_y + 19.8 * mm, n)
        c.setFillColor(INK)
        c.setFont("Segoe-Bold", 9.4)
        c.drawString(x + 14 * mm, flow_y + 19.5 * mm, title)
        para(c, body, x + 6 * mm, flow_y + 13 * mm, fw - 12 * mm, SMALL, 10 * mm)

    rounded(c, M, 18 * mm, W - 2 * M, 31 * mm, DEEP, radius=4 * mm)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8)
    c.drawString(M + 7 * mm, 40 * mm, "REGLA DE ORO")
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 10.5)
    c.drawString(M + 7 * mm, 31 * mm, "Antes de confirmar: verifica código, nombre, fecha, plato y motivo.")
    c.setFillColor(HexColor("#CDEAE9"))
    c.setFont("Segoe", 8.2)
    c.drawString(M + 7 * mm, 23 * mm, "Las excepciones y transferencias registran automáticamente qué usuario de RH realizó el movimiento.")
    footer(c, 1)
    c.showPage()

    # 2. Menú semanal
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    header(c, "Planificación semanal", "1. Preparar el menú", "Publica la semana actual o déjala programada para una semana futura.", 2)
    screenshot(c, "menu")
    three_cards(c, [
        (1, "Elige la semana", "Usa las flechas <b>‹ ›</b>. Para una semana futura, avanza, revisa las fechas y carga las opciones de lunes a viernes.", PALE, TEAL),
        (2, "Define el cierre", "Indica la hora del lunes y pulsa <b>Guardar cierre del lunes</b>. Hasta esa hora los empleados pueden reservar; después, solo RH gestiona excepciones.", white, TEAL),
        (3, "Completa y publica", "Cada día debe tener al menos una comida. Agrega o elimina opciones, revisa nombres y pulsa <b>Guardar y publicar menú</b>. La semana futura queda programada para activarse el lunes.", white, MAGENTA),
    ])
    footer(c, 2); c.showPage()

    # 3. Modificaciones
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    header(c, "Excepciones autorizadas", "2. Modificar un almuerzo", "Úsalo para agregar, cambiar o cancelar una reserva, incluso después del cierre.", 3)
    screenshot(c, "modify")
    three_cards(c, [
        (1, "Busca y verifica", "Ingresa el código, pulsa <b>Buscar reservaciones</b> y confirma el nombre. Selecciona el día correcto antes de continuar.", PALE, TEAL),
        (2, "Elige la acción", "<b>Agregar:</b> olvidó reservar. <b>Cambiar:</b> necesita otro plato. <b>Cancelar:</b> ya no requiere comida. Selecciona la opción disponible para ese día.", white, TEAL),
        (3, "Documenta el motivo", "Escribe una razón clara, por ejemplo: “Empleado ingresó después del cierre con autorización de RH”. Revisa y confirma. El usuario, motivo y momento quedan auditados.", RED_PALE, MAGENTA),
    ])
    footer(c, 3); c.showPage()

    # 4. Transferencias
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    header(c, "Cambio de beneficiario", "3. Transferir una comida", "Mueve una reserva pendiente de quien la pidió hacia quien realmente la recibirá.", 4)
    screenshot(c, "transfer")
    three_cards(c, [
        (1, "Identifica a D1", "D1 es quien reservó. Escribe su código, busca sus comidas pendientes de hoy o fechas futuras y selecciona una.", PALE, TEAL),
        (2, "Indica a D2", "D2 es quien recibirá el almuerzo. Ingresa el código proporcionado y confirma que el beneficiario mostrado sea el correcto.", white, TEAL),
        (3, "Qué cambia", "D1 conserva el historial de la reserva; D2 recibe el ticket, retira la comida y asume el cobro. Si solo se cambiará el plato o la fecha, usa <b>Modificar almuerzo</b>.", RED_PALE, MAGENTA),
    ])
    footer(c, 4); c.showPage()

    # 5. Reportes
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    header(c, "Información y control", "4. Generar reportes", "Cada descarga consulta nuevamente la base de datos y genera un Excel actualizado.", 5)
    screenshot(c, "reports")
    three_cards(c, [
        (1, "Para el proveedor", "Selecciona semana y día. Usa <b>Exportar pedidos del día</b> para el envío diario o <b>Exportar pedidos de la semana</b> para el consolidado. Incluye detalle y totales por plato.", PALE, TEAL),
        (2, "Auditoría individual", "Ingresa el código y el período para revisar reservas, platos y estado de entrega de una persona. Útil para aclaraciones o validaciones puntuales.", white, TEAL),
        (3, "Nómina", "Selecciona el período para consolidar a todo el personal. Cada reserva cuenta aunque esté pendiente; si fue transferida, el cobro se asigna al beneficiario D2.", white, MAGENTA),
    ])
    footer(c, 5); c.showPage()

    # 6. Empleados + decisiones rápidas
    c.setFillColor(PAPER); c.rect(0, 0, W, H, fill=1, stroke=0)
    header(c, "Gestión de personal", "5. Administrar empleados", "Crea, corrige o desactiva registros sin perder el historial existente.", 6)
    screenshot(c, "employees")
    gap = 5 * mm
    y, h = 18 * mm, 48 * mm
    left_w = 126 * mm
    info_card(c, M, y, left_w, h, 1, "Nuevo empleado", "Pulsa <b>Nuevo empleado</b> y completa código, nombre, correo, departamento y estado. Selecciona un departamento existente siempre que corresponda; si escribes uno nuevo, la aplicación pedirá confirmación. Para correcciones usa <b>Editar</b>. <b>Desactivar</b> impide operaciones nuevas, pero conserva el historial.", PALE, TEAL)
    rx = M + left_w + gap
    rw = W - M - rx
    rounded(c, rx, y, rw, h, white, LINE, 3.5 * mm)
    c.setFillColor(INK); c.setFont("Segoe-Bold", 10.2)
    c.drawString(rx + 6 * mm, y + h - 9 * mm, "¿Qué herramienta uso?")
    rows = [
        ("Olvidó pedir o requiere corrección", "Modificar almuerzo"),
        ("Otra persona recibirá una reserva", "Transferencias"),
        ("Enviar cantidades al proveedor", "Reportes"),
        ("Alta, corrección o baja de personal", "Empleados"),
    ]
    row_y = y + h - 17 * mm
    for situation, tool in rows:
        c.setFillColor(TEAL); c.circle(rx + 7 * mm, row_y + 1.2 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(MUTED); c.setFont("Segoe", 7.5)
        c.drawString(rx + 11 * mm, row_y, situation)
        c.setFillColor(INK); c.setFont("Segoe-Semibold", 7.7)
        c.drawRightString(rx + rw - 6 * mm, row_y, tool)
        row_y -= 7.5 * mm
    footer(c, 6); c.showPage()

    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
