/**
 * European Portuguese copy.
 *
 * Typed as `Dictionary`, so it must answer every key `en.ts` declares — adding a
 * string in English and forgetting it here does not compile.
 *
 * Football vocabulary is pt-PT throughout: equipa (not time), guarda-redes (not
 * goleiro), alinhamento (not escalação), cantos (not escanteios), remate (not
 * chute). If this ever grows a pt-BR sibling, those are the words that change.
 */

import type { Dictionary } from "./core";

export const pt: Dictionary = {
  // ------------------------------------------------------------------- app
  "app.name": "Pitchboard",
  "app.opening": "A abrir o quadro partilhado…",
  "app.newBoard": "Começar um quadro novo",
  "app.locale": "Idioma",

  // --------------------------------------------------------------- top bar
  "bar.name.label": "Nome do quadro",
  "bar.name.placeholder": "Quadro sem nome",
  "bar.json": "JSON",
  "bar.json.title":
    "Importar / exportar JSON. Envie o quadro completo e do outro lado abre-se a sua jogada. Um ficheiro de preparação curto define um sistema, um onze e as suas unidades.",
  "bar.export": "Exportar",
  "bar.export.title":
    "MP4, WebM ou GIF da animação completa, ou um PNG do momento no ecrã. Exportado no enquadramento que está a ver.",

  "history.undo": "Anular",
  "history.redo": "Refazer",
  "history.undo.hint": "Anular ({keys})",
  "history.redo.hint": "Refazer ({keys})",

  // -------------------------------------------------------------- sections
  "section.view": "Vista",
  "section.formations": "Sistemas",
  "section.draw": "Desenho",
  "section.links": "Ligações",
  "section.selection": "Seleção",
  "section.drawn": "Desenhado",
  "section.drawn.show": "Mostrar tudo o que está desenhado",
  "section.drawn.hide": "Ocultar a lista de desenhos",

  // ------------------------------------------------------------------ view
  "view.left": "Esquerda",
  "view.full": "Todo",
  "view.right": "Direita",
  "view.vertical": "Vertical",
  "view.horizontal": "Horizontal",
  "view.flat": "Plano",
  "view.3d": "3D",
  "view.playerSize": "Tamanho dos jogadores",
  "view.halfHint":
    "Meio campo é mais alto do que comprido, pelo que na horizontal fica com a mesma altura do campo inteiro e espaço de cada lado. Na vertical preenche o quadro.",

  // ------------------------------------------------------------------ team
  "team.namePlaceholder": "Nome da equipa",
  "team.nameLabel": "Nome da equipa {n}",
  "team.direction": "Sentido do ataque",
  "team.show": "Mostrar esta equipa",
  "team.hide": "Ocultar esta equipa",
  "team.showAria": "Mostrar {team}",
  "team.hideAria": "Ocultar {team}",
  "team.formation": "Sistema",
  "team.addPlayer": "Adicionar jogador ({n})",
  "team.colorAria": "Definir a cor do {team} como {color}",
  "team.patternAria": "Equipamento {pattern} do {team}",

  "pattern.solid": "Liso",
  "pattern.vertical": "Riscas verticais",
  "pattern.horizontal": "Riscas horizontais",

  // ----------------------------------------------------------------- reset
  "reset.positions": "Repor posições",
  "reset.board": "Repor quadro",

  // ---------------------------------------------------------------- share
  "share.copy": "Link",
  "share.copied": "Link copiado",
  "share.title":
    "O quadro inteiro viaja no link, por isso nunca expira. Quem o abrir vê uma cópia só de leitura, no enquadramento que tem agora, e pode criar o seu próprio quadro.",
  "share.failed": "Este navegador não conseguiu comprimir o quadro.",
  "share.long": "{chars} caracteres — demasiado longa para colar em segurança",
  "share.long.title":
    "Este link tem {chars} caracteres, acima dos {budget} que sobrevivem à maioria das aplicações de conversa e do correio eletrónico. Se for cortada, abre como um quadro danificado em vez de dar erro. O desenho à mão livre é quase sempre a causa — exporte o JSON ou simplifique o desenho.",
  "share.anyway": "Copiar mesmo assim",
  "share.manual": "O navegador não chegou à área de transferência — copie o link à mão.",

  // -------------------------------------------------------------- confirms
  "confirm.reset.title": "Repor o quadro?",
  "confirm.reset.message":
    "Todas as cenas, corridas, ligações, desenhos, nomes de jogadores e definições de equipa voltam a um {home} contra um {away} de raiz. Anular traz o quadro de volta.",
  "confirm.reset.action": "Descartar alterações",

  "confirm.positions.title": "Repor todas as posições?",
  "confirm.positions.message":
    "As duas equipas voltam às marcas do seu sistema em todas as cenas e as corridas entre elas são limpas. Nomes, números, ligações, desenhos, a bola e a lista de cenas mantêm-se. Anular traz as posições de volta.",
  "confirm.positions.action": "Repor posições",

  "confirm.links.title.one": "Apagar a ligação?",
  "confirm.links.title.other": "Apagar as {count} ligações?",
  "confirm.links.message":
    "Todos os conectores do quadro desaparecem, nas duas equipas, juntamente com os nomes, estilos e cores que lhes deu. Os jogadores ficam onde estão. Anular traz tudo de volta.",
  "confirm.links.action": "Apagar todas as ligações",

  "confirm.preset.title": "Substituir “{label}”?",
  "confirm.preset.message":
    "Já existe um plantel {formation} guardado com esse nome. Os jogadores, números, equipamento e unidades são substituídos pelos do quadro. Os planteis guardados não fazem parte do quadro, por isso isto não entra no histórico de anulação.",
  "confirm.preset.action": "Substituir plantel",

  "confirm.import.title": "Substituir este quadro?",
  "confirm.import.message":
    "“{name}” vai substituir tudo o que está no quadro — cenas, corridas, ligações e desenhos. Anular traz o quadro antigo de volta.",
  "confirm.import.action": "Substituir quadro",

  "confirm.cancel": "Cancelar",

  // ----------------------------------------------------------- JSON dialog
  "json.title": "JSON do quadro",
  "json.export": "Exportar",
  "json.import": "Importar",
  "json.close": "Fechar",
  "json.wholeBoard": "Quadro completo",
  "json.setupOnly": "Só a preparação",
  "json.wholeBoard.hint": "Todas as cenas, corridas, ligações e desenhos — a jogada como a deixou.",
  "json.setupOnly.hint": "Sistema, nomes, números e unidades. Sem cenas.",
  "json.payload.label": "JSON do quadro",
  "json.copy": "Copiar",
  "json.copied": "Copiado",
  "json.download": "Transferir",
  "json.import.hint":
    "Cole um quadro completo, ou uma preparação com o sistema, o onze e as suas unidades. Os jogadores são listados pela ordem do sistema, guarda-redes primeiro; uma ligação nomeia números de camisola.",
  "json.import.label": "JSON a importar",
  "json.loadFile": "Carregar um ficheiro",
  "json.useExample": "Usar o exemplo",
  "json.clipboard": "O navegador recusou o acesso à área de transferência — selecione o texto e copie-o à mão.",
  "json.replaceBoard": "Substituir quadro",

  // --------------------------------------------------- seeded document text
  "doc.board": "Quadro sem nome",
  "doc.scene": "Cena {n}",
  "doc.sceneCopy": "{name} (cópia)",
  "doc.home": "Casa",
  "doc.away": "Fora",

  // -------------------------------------------------------------- timeline
  "timeline.scrub": "Percorrer a linha temporal",
  "timeline.flow": "Movimento contínuo",
  "timeline.flow.on":
    "Um só movimento contínuo: nada fica parado entre cenas e cada cena dura o que a sua corrida mais longa precisar",
  "timeline.flow.off": "Voltar aos tempos de deslocação e de espera por cena",
  "timeline.addScene": "Adicionar cena",
  "timeline.scene": "Cena",
  "timeline.pace": "Ritmo",
  "timeline.pace.title":
    "Metros por segundo da corrida para esta cena. Cada cena guarda o seu, e uma cena acrescentada a seguir herda o mesmo ritmo.",
  "timeline.endHold": "Espera final",
  "timeline.travel": "Deslocação",
  "timeline.hold": "Espera",
  "timeline.ball": "Bola",
  "timeline.shot": "Remate",
  "timeline.shotMark": "remate",
  "timeline.shot.can": "Desenhar o percurso da bola para esta cena como um remate em vez de um passe",
  "timeline.shot.cannot":
    "Só uma bola solta pode ser um remate — liberte-a, ou jogue-a para um adversário",
  "timeline.moveEarlier": "Mover a cena para trás",
  "timeline.moveLater": "Mover a cena para a frente",
  "timeline.duplicate": "Duplicar a cena",
  "timeline.deleteScene": "Apagar a cena",

  // ------------------------------------------------------------- inspector
  "inspect.empty":
    "Clique num jogador para o selecionar, duplo clique para lhe mudar o nome. Shift+clique para juntar, ou arraste sobre a relva vazia para marcar uma área. As setas deslocam; com shift, 5 m. O espaço reproduz.",
  "inspect.selected": "{count} selecionados",
  "inspect.clear": "limpar",
  "inspect.travelTime": "Tempo de deslocação",
  "inspect.matchScene": "igualar à cena",
  "inspect.travel.default": "s — valor da cena",
  "inspect.travel.unit": "s",
  "inspect.travel.hint":
    "Menos do que a cena significa que este jogador chega cedo e espera. Mais estica a cena inteira, que passa a durar {seconds} s.",
  "inspect.travel.reset": "Usar o valor da cena",
  "inspect.ball": "Bola — {scene}",
  "inspect.ball.release": "Libertar a bola",
  "inspect.ball.give": "Dar a bola a {who}",
  "inspect.ball.hint": "Dar a bola a outro jogador na cena seguinte faz um passe.",
  "inspect.ballName": "Bola",
  "inspect.remove": "Remover {who}",
  "inspect.run": "Corrida — {scene}",
  "inspect.straighten": "Endireitar",
  "inspect.showRuns": "Mostrar as setas de movimento",
  "inspect.hideRuns": "Ocultar as setas de movimento",
  "inspect.run.hint":
    "Arraste as pegas âmbar na corrida de um jogador selecionado para a curvar. Ocultar uma seta aplica-se só a esta cena — o jogador continua a mover-se.",
  "inspect.name": "Nome",
  "inspect.number": "N.º",
  "inspect.playerPlaceholder": "Jogador {number}",
  "inspect.clash": "{who} já usa o {number} nesta equipa.",

  // ----------------------------------------------------------------- export
  "export.title": "Exportar",
  "export.close": "Fechar",
  "export.format": "Formato",
  "export.resolution": "Resolução",
  "export.size": "Tamanho",
  "export.frame": "Momento",
  "export.frames": "Imagens",
  "export.length": "Duração",
  "export.frameRate": "Imagens por segundo",
  "export.bitrate": "Bitrate",
  "export.run": "Exportar {format}",
  "export.again": "Transferir de novo",
  "export.cancel": "Cancelar",
  "export.blurb.mp4": "H.264. Abre em todo o lado — QuickTime, VLC, um navegador, um telemóvel.",
  "export.blurb.webm": "VP9. Mais pequeno do que MP4 com a mesma qualidade; nem todos os leitores o aceitam.",
  "export.blurb.gif": "Repete-se sozinho e cola-se numa conversa. Uma só paleta, por isso sem tremeluzir.",
  "export.blurb.png": "O momento em que está o cursor, na resolução máxima.",
  "export.phase.palette": "A construir a paleta",
  "export.phase.render": "A desenhar",
  "export.phase.finalise": "A escrever o ficheiro",
  "export.unavailable": "Este navegador não consegue codificar {format} a {width}×{height}",
  "export.unavailable.try": " — experimente {alternative}, um tamanho menor, ou um GIF.",
  "export.unavailable.smaller": " — experimente um tamanho menor, ou um GIF.",

  // ------------------------------------------------------------ draw panel
  "draw.tool.select": "Selecionar",
  "draw.tool.select.hint": "Selecionar e mover (Esc)",
  "draw.tool.arrow": "Seta",
  "draw.tool.arrow.hint": "Arraste uma seta — uma corrida, um passe ou um remate",
  "draw.tool.line": "Linha",
  "draw.tool.line.hint": "Arraste uma linha sem ponta",
  "draw.tool.rect": "Retângulo",
  "draw.tool.rect.hint": "Arraste uma zona retangular",
  "draw.tool.ellipse": "Elipse",
  "draw.tool.ellipse.hint": "Arraste uma zona oval",
  "draw.tool.pen": "Caneta",
  "draw.tool.pen.hint": "Desenhar à mão livre",
  "draw.tool.text": "Texto",
  "draw.tool.text.hint": "Clique para colocar uma etiqueta",
  "draw.keep": "Fixar",
  "draw.keep.aria": "Manter a ferramenta ativa",
  "draw.keep.title": "Continuar na ferramenta depois de desenhar, para várias formas seguidas",
  "draw.colorAria": "Desenhar em {color}",
  "draw.dash.solid": "Corrida",
  "draw.dash.solid.hint": "Contínua — uma corrida ou uma linha simples",
  "draw.dash.dashed": "Passe",
  "draw.dash.dashed.hint": "Tracejada — a convenção do passe",
  "draw.dash.wavy": "Drible",
  "draw.dash.wavy.hint": "Ondulada — a convenção do drible",
  "draw.hint.select": "{n} desenhadas. Clique numa para mudar o estilo, ou escolha uma ferramenta acima.",
  "draw.hint.drawing": "Arraste sobre o campo para desenhar. Esc volta a selecionar.",
  "draw.selected": "{kind} selecionada",
  "draw.show": "Mostrar",
  "draw.hide": "Ocultar",
  "draw.showThis": "Mostrar esta forma",
  "draw.hideThis": "Ocultar esta forma",
  "draw.label.placeholder": "Etiqueta",
  "draw.label.aria": "Texto da etiqueta",
  "draw.size.aria": "Tamanho da etiqueta",
  "draw.size.title": "Tamanho da etiqueta, em percentagem do valor por omissão",
  "draw.from": "De",
  "draw.to": "Até",
  "draw.delete": "Apagar forma",

  // ---------------------------------------------------------------- shapes
  "kind.arrow": "Seta",
  "kind.line": "Linha",
  "kind.rect": "Retângulo",
  "kind.ellipse": "Elipse",
  "kind.pen": "Mão livre",
  "kind.text": "Texto",

  // ----------------------------------------------------------- drawn list
  "drawn.empty":
    "Ainda não há nada desenhado. Escolha uma ferramenta no painel Desenho e arraste sobre o campo — setas, zonas, mão livre e etiquetas aparecem todas aqui.",
  "drawn.onScene": "Em {scene}",
  "drawn.thisScene": "esta cena",
  "drawn.allScenes": "Todas as cenas",
  "drawn.collapse": "Fechar",
  "drawn.expand": "Abrir",
  "drawn.collapseAll": "Fechar todas as cenas",
  "drawn.expandAll": "Abrir todas as cenas",
  "drawn.noneHere.one": "Nada nesta cena. {count} forma noutro sítio.",
  "drawn.noneHere.other": "Nada nesta cena. {count} formas noutros sítios.",
  "drawn.reorder": "Reordenar {label}",
  "drawn.reorder.title": "Arraste para reordenar dentro desta cena — as formas mais abaixo desenham por cima",
  "drawn.nameLabel": "Nome de {label}",
  "drawn.rename.here": "Mudar o nome — clicar também seleciona",
  "drawn.rename.away": "Mudar o nome — clicar também salta para lá",
  "drawn.showShape": "Mostrar a forma",
  "drawn.hideShape": "Ocultar a forma",
  "drawn.delete": "Apagar {label}",
  "drawn.visibleFrom": "Visível a partir de",
  "drawn.visibleTo": "Visível até",
  "drawn.end": "Fim",
  "drawn.span.one": "1 cena",
  "drawn.span.other": "{count} cenas",

  // ----------------------------------------------------------------- links
  "links.count": "Ligações ({n})",
  "links.deleteAll": "Apagar todas",
  "links.deleteAll.title": "Apagar todas as ligações do quadro",
  "links.needTwo": "Selecione 2 ou mais jogadores para ligar",
  "links.linkPlayers": "Ligar {n} jogadores",
  "links.style.chain": "Cadeia",
  "links.style.polygon": "Forma",
  "links.style.filled": "Preenchida",
  "links.style.chain.hint": "Linha aberta — uma linha de quatro não se pode fechar sobre si própria",
  "links.style.polygon.hint": "Contorno fechado",
  "links.style.filled.hint": "Fechada e sombreada — mostra a área a encolher",
  "links.reorder": "Reordenar {name}",
  "links.reorder.title": "Arraste para reordenar, ou foque e use as setas. As ligações mais abaixo desenham por cima.",
  "links.expandRow": "Mudar o nome e o estilo de {name}",
  "links.collapseRow": "Fechar {name}",
  "links.edit.title": "Mudar o nome, o estilo e a ordem",
  "links.showDistances": "Mostrar distâncias",
  "links.hideDistances": "Ocultar distâncias",
  "links.show": "Mostrar ligação",
  "links.hide": "Ocultar ligação",
  "links.selectMembers": "Selecionar {n} jogadores",
  "links.name": "Nome",
  "links.name.label": "Nome da ligação",
  "links.colour": "Cor",
  "links.auto": "Automática",
  "links.auto.title": "Seguir a cor do equipamento da equipa",
  "links.colorAria": "Definir a cor de {name} como {color}",
  "links.order": "Ordem",
  "links.moveEarlier": "Mover o {number} para trás",
  "links.moveLater": "Mover o {number} para a frente",
  "links.delete": "Apagar ligação",

  // ---------------------------------------------------------- squad presets
  "preset.label": "Plantel guardado",
  "preset.manage": "Gerir planteis guardados",
  "preset.manage.title": "Mudar o nome ou apagar planteis guardados",
  "preset.namePlaceholder": "Dê um nome a este plantel",
  "preset.nameLabel": "Nome do plantel guardado",
  "preset.save": "Guardar plantel",
  "preset.saveAs": "Guardar o {team} como plantel",
  "preset.load": "Carregar um plantel…",
  "preset.none": "Ainda não há planteis guardados",
  "preset.loadInto": "Carregar um plantel guardado para o {team}",
  "preset.rename": "Nome do plantel guardado {label}",
  "preset.delete": "Apagar o plantel {label}",
  "preset.defaultName": "Plantel",

  // ------------------------------------------------------- engine messages
  "migrate.notABoard": "Isto não é um quadro do Pitchboard.",
  "migrate.noVersion": "Este quadro não tem versão, por isso não pode ser lido.",
  "migrate.tooNew":
    "Este quadro foi feito por uma versão mais recente do Pitchboard (v{version}). Atualize a página e tente de novo.",
  "migrate.noStep": "Não há forma de ler um quadro v{version} nesta versão.",

  "link.damaged": "Esta ligação está danificada — pode ter sido cortada pelo caminho.",
  "link.notABoard": "Esta ligação não contém um quadro.",
  "link.unreadable": "Esta ligação contém um quadro que esta versão não consegue ler.",

  "import.tooLarge": "Demasiado grande — o limite é {kb} KB.",
  "import.notJson": "Isto não é JSON válido.",
  "import.invalid": "Este ficheiro não é um quadro que o Pitchboard consiga ler: {detail}",
  "import.failed": "Não foi possível construir um quadro a partir desta preparação.",
  "import.team.unknownFormation": "Equipa {n}: “{formation}” não é um sistema que o Pitchboard conheça.",
  "import.team.tooManyPlayers":
    "Equipa {n}: {listed} jogadores indicados mas o {formation} tem {places} lugares.",
  "import.team.duplicateNumber": "Equipa {n}: dois jogadores têm o mesmo número.",
  "import.link.missing.team": "Equipa {n}: nenhum jogador usa o {number}, por isso não pode ser ligado.",
  "import.link.missing.preset": "“{label}”: nenhum jogador usa o {number}, por isso não pode ser ligado.",
  "import.link.duplicate.team": "Equipa {n}: uma ligação nomeia o mesmo jogador duas vezes.",
  "import.link.duplicate.preset": "“{label}”: uma ligação nomeia o mesmo jogador duas vezes.",

  "preset.duplicateNumber": "Dois jogadores deste plantel têm o mesmo número.",
  "preset.unknownFormation": "“{formation}” não é um sistema que o Pitchboard conheça.",
  "preset.tooManyPlayers": "{saved} jogadores guardados mas o {formation} tem {places} lugares.",
  "preset.invalid": "Esta predefinição não descreve uma equipa válida.",
  "preset.failed": "Não foi possível aplicar esta predefinição.",

  // --------------------------------------------------------------- account
  "account.signIn": "Entrar",
  "account.signIn.google": "Continuar com Google",
  "account.signIn.why": "Entra para guardares os teus quadros e agrupá-los em projetos.",
  "account.signedInAs": "Sessão iniciada como",
  "account.menu": "Conta",
  "account.signOut": "Terminar sessão",
  "account.error.access_denied": "O início de sessão foi cancelado.",
  "account.error.invalid_state": "Essa ligação de início de sessão expirou. Tenta novamente.",
  "account.error.email_unverified": "A Google não verificou esse endereço de email.",
  "account.error.unknown": "O início de sessão não foi concluído. Tenta novamente.",
  "account.error.dismiss": "Dispensar",

  // ---------------------------------------------------------------- viewer
  "viewer.shared": "Quadro partilhado",
  "viewer.fork": "Copiar para editar",
  "viewer.scenes.one": "1 cena",
  "viewer.scenes.other": "{count} cenas",
  "viewer.play": "Reproduzir",
  "viewer.pause": "Pausa",
  "viewer.loop": "Repetir",
  "viewer.loop.on": "Repetir",
  "viewer.loop.off": "Parar no fim",
  "viewer.scrub": "Percorrer",
};
