from pathlib import Path

from PIL import Image as PILImage, ImageEnhance
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(r"C:\Users\dev05\Desktop\MarcacionComida\BiometricoLunch-")
TMP = ROOT / "tmp" / "pdfs" / "enrolamiento"
OUT = ROOT / "output" / "pdf"
TMP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "kiosk": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-c290312c-c077-4094-83f3-c646e327412c.png"),
    "empty": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-b4b2fe08-c181-471f-96ab-694338b6cc45.png"),
    "employee": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-339c2558-d516-484e-ba04-b57a26ab133a.png"),
    "authorization": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-64a470fb-df85-4a71-8608-7ade9ab903e1.png"),
    "approved": Path(r"C:\Users\dev05\AppData\Local\Temp\codex-clipboard-cab325a9-2003-453c-8095-32724641fa2f.png"),
}
IMAGES = {name: TMP / f"{name}.png" for name in SOURCES}
PDF_PATH = OUT / "Manual_Enrolamiento_Biometrico_Recursos_Humanos.pdf"

W, H = landscape(A4)
M = 14 * mm
INK = HexColor("#061C1C")
DEEP = HexColor("#003B3D")
TEAL = HexColor("#08B9BE")
PALE = HexColor("#E8FAF9")
PAPER = HexColor("#F5FAF9")
LINE = HexColor("#C4E4E3")
MUTED = HexColor("#557273")
MAGENTA = HexColor("#F500AE")
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
        # Conserva toda la aplicación y elimina únicamente la barra de título y la barra de tareas.
        top = 26 if image.height > 1000 else 0
        bottom = 48 if image.height > 1000 else 0
        image = image.crop((4, top, image.width - 4, image.height - bottom))
        image = ImageEnhance.Contrast(image).enhance(1.04)
        image.save(IMAGES[name], quality=95)


def rounded(c, x, y, w, h, fill, stroke=None, radius=3.5 * mm, width=0.7):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.setLineWidth(width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


BODY = ParagraphStyle("body", fontName="Segoe", fontSize=8.2, leading=10.6, textColor=MUTED)
SMALL = ParagraphStyle("small", fontName="Segoe", fontSize=7.2, leading=9.2, textColor=MUTED)
WHITE_BODY = ParagraphStyle("white", fontName="Segoe", fontSize=8.5, leading=11, textColor=HexColor("#CDEAE9"))


def para(c, text, x, top, width, style, max_h=35 * mm):
    p = Paragraph(text, style)
    _, height = p.wrap(width, max_h)
    p.drawOn(c, x, top - height)
    return height


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
    c.drawString(M, 5.8 * mm, "Comedor Fasani - Manual de enrolamiento biométrico")
    c.drawRightString(W - M, 5.8 * mm, f"{page} / 6")


def header(c, section, title, subtitle, page):
    c.setFillColor(INK)
    c.rect(0, H - 31 * mm, W, 31 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Segoe-Bold", 8)
    c.drawString(M, H - 10 * mm, section.upper())
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 21)
    c.drawString(M, H - 21 * mm, title)
    c.setFillColor(HexColor("#BEE7E6"))
    c.setFont("Segoe", 8.8)
    c.drawString(M + 112 * mm, H - 20.5 * mm, subtitle)
    rounded(c, W - M - 27 * mm, H - 22.5 * mm, 27 * mm, 9 * mm, MAGENTA, radius=4.5 * mm)
    c.setFillColor(white)
    c.setFont("Segoe-Bold", 8)
    c.drawCentredString(W - M - 13.5 * mm, H - 19.7 * mm, f"PASO {page - 1}")


def screenshot(c, key):
    y = 74 * mm
    rounded(c, M, y, W - 2 * M, 98 * mm, white, LINE, 4 * mm)
    fit_image(c, IMAGES[key], M + 2 * mm, y + 2 * mm, W - 2 * M - 4 * mm, 94 * mm)


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


def base_page(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def build():
    fonts()
    prepare_images()
    c = canvas.Canvas(str(PDF_PATH), pagesize=(W, H))
    c.setTitle("Manual de enrolamiento biométrico para Recursos Humanos")
    c.setAuthor("Fasani")
    c.setSubject("Procedimiento para registrar la huella de empleados en el kiosco de comedor")

    # Portada
    base_page(c)
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
    c.drawString(M, H - 53 * mm, "Enrolamiento")
    c.drawString(M, H - 67 * mm, "biométrico de empleados")
    para(c, "Cómo registrar una huella correctamente y dejar el kiosco listo para la siguiente persona.",
         M, H - 76 * mm, 165 * mm, WHITE_BODY)

    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 15)
    c.drawString(M, H - 108 * mm, "La ruta de enrolamiento en cinco momentos")
    flow_y = H - 148 * mm
    gap = 4 * mm
    fw = (W - 2 * M - 4 * gap) / 5
    flows = [
        ("1", "Ingresar", "Abrir Enrolar empleado"),
        ("2", "Buscar", "Confirmar código y nombre"),
        ("3", "Autorizar", "Validar con huella de RH"),
        ("4", "Capturar", "Aceptar cuatro muestras"),
        ("5", "Finalizar", "Volver al kiosco"),
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
    c.drawString(M + 7 * mm, 40 * mm, "ANTES DE EMPEZAR")
    c.setFillColor(white)
    c.setFont("Segoe-Semibold", 10.5)
    c.drawString(M + 7 * mm, 31 * mm, "Confirma que el empleado exista en el portal y que autorizó el registro de su huella.")
    c.setFillColor(HexColor("#CDEAE9"))
    c.setFont("Segoe", 8.2)
    c.drawString(M + 7 * mm, 23 * mm, "El sistema indica que no muestra ni almacena imágenes de huellas durante el proceso.")
    footer(c, 1)
    c.showPage()

    # Paso 1
    base_page(c)
    header(c, "Ingreso al mantenimiento", "1. Abrir el enrolamiento", "Inicia siempre desde la pantalla principal del kiosco.", 2)
    screenshot(c, "kiosk")
    three_cards(c, [
        (1, "Reconoce la pantalla", "La pantalla inicial muestra <b>Leyendo huella</b> y el estado <b>Identificación activa</b>. Esta vista se utiliza normalmente para identificar empleados y entregar comidas.", PALE, TEAL),
        (2, "No coloque el dedo", "<b>Precaución:</b> no pida al empleado colocar su dedo mientras aparezca “Leyendo huella”. Podría iniciar una identificación o una entrega en lugar del enrolamiento.", AMBER, MAGENTA),
        (3, "Entra al módulo", "Pulsa <b>Enrolar empleado</b>, ubicado en la parte inferior derecha. Verifica que aparezca el título <b>Mantenimiento · Enrolamiento biométrico</b> antes de continuar.", white, TEAL),
    ])
    footer(c, 2)
    c.showPage()

    # Paso 2
    base_page(c)
    header(c, "Selección del empleado", "2. Buscar y verificar", "El código y el nombre deben corresponder a la persona presente.", 3)
    screenshot(c, "employee")
    three_cards(c, [
        (1, "Ingresa el código", "Escribe el código del empleado en el buscador. Espera a que la aplicación muestre el código y el nombre completo debajo del campo.", PALE, TEAL),
        (2, "Verifica la identidad", "Compara el nombre mostrado con la persona presente. Revisa también el dedo seleccionado; en el ejemplo aparece <b>Índice derecho</b>.", white, TEAL),
        (3, "Si no aparece en la lista", "Puede significar que la persona <b>ya está enrolada</b> o que todavía no existe en el portal. Verifica primero si ya tiene una huella registrada. Si no existe, créala en <b>Portal · Empleados</b>, regresa al kiosco y vuelve a buscarla. Nunca uses el código de otra persona.", RED_PALE, MAGENTA),
    ])
    footer(c, 3)
    c.showPage()

    # Paso 3
    base_page(c)
    header(c, "Consentimiento y control", "3. Autorizar el proceso", "La persona de Gestión Humana valida el inicio con su propia huella.", 4)
    screenshot(c, "authorization")
    three_cards(c, [
        (1, "Confirma el consentimiento", "Marca la casilla únicamente después de que la persona autorice el registro de su huella. Después pulsa <b>Iniciar enrolamiento</b>.", PALE, TEAL),
        (2, "Autoriza con huella de RH", "Cuando la pantalla cambie a rojo y solicite <b>Autorización de Gestión Humana</b>, una persona autorizada de RH debe colocar su dedo en el lector.", AMBER, MAGENTA),
        (3, "Espera la aprobación", "Mantén el dedo quieto hasta que la aplicación confirme la lectura. Si no avanza, retira el dedo, limpia y seca suavemente la yema y vuelve a intentarlo.", white, TEAL),
    ])
    footer(c, 4)
    c.showPage()

    # Paso 4
    base_page(c)
    header(c, "Registro biométrico", "4. Capturar cuatro muestras", "Después de la autorización, el lector queda listo para el empleado.", 5)
    screenshot(c, "approved")
    three_cards(c, [
        (1, "Retira el dedo de RH", "Confirma que la pantalla esté verde y muestre <b>Autorización aprobada</b>. La persona de RH debe retirar completamente su dedo del lector.", PALE, TEAL),
        (2, "Inicia la captura", "Pulsa <b>Capturar huella del empleado</b>. Ahora sí, pide al empleado colocar el dedo seleccionado plano, centrado y sin moverlo.", white, TEAL),
        (3, "Completa 4 de 4", "Sigue las indicaciones para colocar y retirar el mismo dedo. Verifica que el contador avance hasta <b>Muestras aceptadas: 4 de 4</b>. Si una muestra no se acepta, ajusta la posición y repite.", white, MAGENTA),
    ])
    footer(c, 5)
    c.showPage()

    # Paso 5
    base_page(c)
    header(c, "Cierre del procedimiento", "5. Finalizar y volver", "Cierra cada enrolamiento antes de comenzar con otra persona.", 6)
    screenshot(c, "approved")
    gap = 5 * mm
    y, h = 18 * mm, 48 * mm
    left_w = 126 * mm
    info_card(c, M, y, left_w, h, 1, "Confirma el resultado", "No retires al empleado hasta que la aplicación indique que el registro terminó correctamente. Si se muestra un error o el contador no llega a 4 de 4, repite únicamente las muestras solicitadas y vuelve a comprobar el resultado.", PALE, TEAL)
    rx = M + left_w + gap
    rw = W - M - rx
    rounded(c, rx, y, rw, h, white, LINE, 3.5 * mm)
    c.setFillColor(INK)
    c.setFont("Segoe-Bold", 10.2)
    c.drawString(rx + 6 * mm, y + h - 9 * mm, "Para enrolar a otra persona")
    rows = [
        ("1", "Pulsa Volver al kiosco"),
        ("2", "Espera la pantalla Leyendo huella"),
        ("3", "Pulsa nuevamente Enrolar empleado"),
        ("4", "Busca y verifica al siguiente empleado"),
    ]
    row_y = y + h - 18 * mm
    for number, instruction in rows:
        c.setFillColor(MAGENTA if number == "1" else TEAL)
        c.circle(rx + 7 * mm, row_y + 1.2 * mm, 3 * mm, fill=1, stroke=0)
        c.setFillColor(white if number == "1" else INK)
        c.setFont("Segoe-Bold", 7)
        c.drawCentredString(rx + 7 * mm, row_y - 1 * mm, number)
        c.setFillColor(INK)
        c.setFont("Segoe-Semibold", 8)
        c.drawString(rx + 13 * mm, row_y - 1 * mm, instruction)
        row_y -= 7.5 * mm
    footer(c, 6)
    c.showPage()

    c.save()
    print(PDF_PATH)


if __name__ == "__main__":
    build()
