import type { Strings } from "./en";

const ptBr: Strings = {
  htmlLang: "pt-BR",
  otherLang: { lang: "en", label: "English" },
  meta: {
    title: "Dynamic Island para Windows",
    description:
      "Uma Dynamic Island no estilo do iPhone para o topo da área de trabalho do Windows: música, sessões do Claude Code, notificações e mais.",
    privacyTitle: "Política de Privacidade · Dynamic Island para Windows",
  },
  island: {
    waiting: "Esperando você",
    request: "O Claude Code quer executar",
    command: "bun run build",
    project: "windows-dynamic-island",
    allow: "Permitir",
    always: "Sempre permitir",
    deny: "Negar",
    working: "Compilando",
    denied: "Negado",
    track: "Midnight City",
    artist: "M83",
    replay: "Mostrar o pedido de permissão de novo",
    hint: "Experimente os botões. No app, é assim que você responde ao Claude Code sem largar o que está fazendo.",
  },
  hero: {
    title: "Uma Dynamic Island para o topo da área de trabalho do Windows",
    lead: "Ela mostra o que está tocando, o que suas sessões do Claude Code estão fazendo e suas notificações, e fica fora do caminho no resto do tempo.",
    download: "Baixar para Windows",
    github: "Ver o código-fonte",
    note: "Gratuito e de código aberto, para Windows 10 e 11.",
  },
  features: {
    agents: {
      title: "Suas sessões do Claude Code, ao vivo",
      body: "Veja qual sessão está trabalhando, qual está esperando você e quanto do seu plano ainda resta. Pedidos de permissão aparecem na ilha com o comando, arquivo ou URL, e você permite ou nega por ali mesmo.",
      alt: "Painel de Agentes de IA com limites do plano, tokens usados hoje, gráfico de 7 dias e as sessões ativas",
    },
    music: {
      title: "Música de qualquer player",
      body: "Spotify, navegadores, Apple Music, VLC: tudo que aparece nos controles de mídia do Windows. Faixa, capa, uma barra de progresso clicável e um visualizador. Um vídeo do YouTube toca sem som dentro da ilha, e Fixar abre ele numa janelinha flutuante.",
      alt: "Painel de música expandido com capa do álbum, faixa, barra de progresso e controles",
    },
    ask: {
      title: "Pergunte ao Claude de qualquer lugar",
      body: "Aperte Ctrl+Alt+Space e digite. Usa o login do Claude Code, então não precisa de chave de API, e pode anexar um print da janela em que você estava.",
      alt: "Ilha compacta mostrando uma sessão do Claude Code esperando permissão, ao lado das bolhas do GitHub e da música",
    },
    launcher: {
      title: "Muitos módulos, pouca bagunça",
      body: "Fixe na barra de abas os módulos que você mais usa e deixe o resto a um clique, no launcher. Arraste para reordenar, ou desligue os que você não precisa.",
      alt: "Launcher mostrando todos os módulos como blocos",
    },
    shelf: {
      title: "Uma prateleira e um histórico de cópias",
      body: "Solte arquivos na ilha e ela guarda até você arrastar para outro app. O que você copia aparece por um instante, e os últimos 20 itens ficam numa lista.",
      alt: "Prateleira com um PDF, uma pasta e uma imagem",
    },
  },
  looks: {
    title: "Um entalhe preto ou uma pílula brilhante",
    body: "Deixe como um entalhe preto pendurado na borda de cima, ou troque por uma pílula flutuante com borda em um de sete gradientes, ou com duas cores suas.",
    items: ["Dynamic Island", "Windows Island, clássica", "Windows Island, mono fina", "Windows Island, Aurora com brilho"],
  },
  more: {
    title: "E também",
    items: [
      ["Notificações", "WhatsApp, Teams, Outlook, Discord e outros apps, espelhados do Windows."],
      ["Agenda", "Suas próximas reuniões do Google Agenda ou de qualquer link iCal, com botão para entrar."],
      ["GitHub", "Issues abertas dos repositórios que você acompanha."],
      ["Monitor do sistema", "CPU, memória, GPU e rede, com aviso quando algo fica no máximo."],
      ["Atividades ao vivo", "Volume, bateria, fones Bluetooth e o que seus scripts mandarem para a API local."],
      ["Fora do caminho", "Some em jogos e vídeos em tela cheia, expande ao passar o mouse e troca de aba com a rodinha."],
    ],
  },
  privacy: {
    title: "Seus dados ficam no seu computador",
    body: "Sem conta, sem analytics, sem telemetria. Quando um módulo precisa de um serviço online, como o Google Agenda ou o GitHub, o app fala direto com ele, e só depois que você liga esse módulo.",
    link: "Ler a política de privacidade",
  },
  footer: {
    version: "Versão mais recente",
    license: "Licenciado sob GPL-3.0",
    privacy: "Política de privacidade",
    issues: "Relatar um problema",
  },
  policy: {
    back: "Voltar para a página inicial",
  },
};

export default ptBr;
