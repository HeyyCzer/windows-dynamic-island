# Política de Privacidade — Dynamic Island para Windows

*Última atualização: 8 de outubro de 2026*

Dynamic Island para Windows ("o app") é um app de desktop gratuito e de código aberto, publicado em [github.com/HeyyCzer/windows-dynamic-island](https://github.com/HeyyCzer/windows-dynamic-island). Esta política explica quais dados o app acessa, para onde eles vão e como removê-los.

Esta é uma tradução da [versão em inglês](https://heyyczer.github.io/windows-dynamic-island/privacy/). Se houver qualquer diferença entre as duas, vale a versão em inglês.

## Resumo

- O app roda inteiramente no seu computador. **Não existe servidor nosso**: sem conta, sem analytics, sem telemetria, sem anúncios, sem relatórios de falha.
- Nós (os desenvolvedores) **nunca recebemos nenhum dado seu**.
- Quando um recurso precisa de um serviço online (Google Agenda, GitHub, Anthropic, YouTube, verificação de atualizações), o app fala com esse serviço direto do seu computador, e só depois que você liga esse recurso.
- Não vendemos, alugamos nem compartilhamos seus dados com ninguém.

## O que fica no seu computador

| Dado | Onde | Por quê |
| --- | --- | --- |
| Configurações | `%APPDATA%\com.heyyczer.dynamicisland\settings.json` | Lembrar suas preferências |
| Tokens e links privados (refresh token do Google Agenda, token do GitHub, URLs de feeds de agenda privados) | Gerenciador de Credenciais do Windows | Manter segredos fora de arquivos de texto |
| Itens da prateleira (caminhos dos arquivos que você soltou, não os arquivos) | `%APPDATA%\com.heyyczer.dynamicisland\shelf.json` | Manter a prateleira entre reinícios |
| Prints e anexos do Pergunte ao Claude, imagens da área de transferência | `%APPDATA%\com.heyyczer.dynamicisland\` e, quando você escolhe guardar uma imagem, *Imagens\Capturas de Tela* | Anexar a uma pergunta ou deixar você arrastar para fora |
| Eventos da agenda, texto da área de transferência, notificações espelhadas, o que está tocando, estatísticas do sistema | Só na memória | Mostrar na ilha; somem quando o app fecha |

O app lê, sem enviar para lugar nenhum, informações que o Windows e outros apps já guardam no seu computador: dados de reprodução de mídia, notificações do Windows (só depois que você ativa o módulo Notificações), a área de transferência (o que é copiado por gerenciadores de senha é ignorado), bateria, volume, dispositivos Bluetooth, contadores de desempenho e as transcrições e configurações locais do Claude Code em `~/.claude`.

## Serviços online

Cada um só é usado quando o módulo correspondente está ativado.

### Google Agenda

Se você clica em **Conectar Google Agenda**, você entra na própria página do Google e concede ao app o escopo somente leitura `https://www.googleapis.com/auth/calendar.readonly`.

- **O que é acessado:** sua lista de agendas (nome, cor, se está selecionada/é a principal) e os eventos numa janela curta em torno de hoje (título, início/fim, local, descrição, status, links de reunião).
- **Como é usado:** só para mostrar seus próximos eventos e links de reunião dentro da ilha. O app não pode criar, alterar nem apagar nada na sua agenda.
- **Para onde vai:** as requisições vão direto do seu computador para o Google (`accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`). Os dados dos eventos ficam só na memória e nunca são gravados em disco nem enviados a mais ninguém, inclusive nós.
- **Armazenamento:** só o refresh token OAuth é guardado, no Gerenciador de Credenciais do Windows.
- **Desconectar:** **Desconectar** no app revoga o token junto ao Google e o apaga do seu computador. Você também pode revogar o acesso a qualquer momento em [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

O uso e a transferência, pelo app, de informações recebidas das APIs do Google seguem a [Política de Dados do Usuário dos Serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de Uso Limitado. Os dados de usuário do Google não são usados para publicidade, não são vendidos, não são transferidos a terceiros, não são usados para treinar modelos de IA e não são lidos por pessoas.

### Feeds de agenda (iCal)

Os links de agenda que você adiciona são baixados direto do servidor que os hospeda. Os links são guardados no Gerenciador de Credenciais do Windows.

### GitHub

Para contar as issues abertas dos repositórios que você acompanha, o app chama `api.github.com`, de forma anônima ou com o seu login do GitHub CLI ou um token que você fornecer (guardado no Gerenciador de Credenciais do Windows).

### Claude Code e Anthropic

- **Limites do plano:** o app envia o token OAuth que o Claude Code já guarda em `~/.claude/.credentials.json` somente para `api.anthropic.com`, para ler seus limites de uso.
- **Pergunte ao Claude:** as perguntas, e qualquer print ou arquivo que você anexar, são passados para o Claude Code CLI (`claude -p`) instalado no seu computador, que os envia à Anthropic na sua própria conta do Claude. A [política de privacidade da Anthropic](https://www.anthropic.com/legal/privacy) se aplica a isso.
- **Integração:** quando você a ativa, o app adiciona hooks e uma ponte de statusline em `~/.claude/settings.json` (com backup). Eles enviam o status das sessões só para o próprio app, em `127.0.0.1`.

### YouTube

Para tocar uma cópia sem som de um vídeo do YouTube que você está vendo no navegador, o app pesquisa no `youtube.com` o título e o artista da faixa atual. A política de privacidade do YouTube se aplica a essa requisição.

### Atualizações

O app verifica no GitHub Releases se há versões novas. O GitHub vê uma requisição de download comum (como o seu endereço IP), como em qualquer site.

### API local

O app escuta em `127.0.0.1:5199`, acessível só do seu próprio computador, para que seus scripts possam enviar alertas a ele.

## Serviços de terceiros

Quando o app fala com Google, GitHub, Anthropic ou YouTube, essas empresas processam a requisição sob suas próprias políticas de privacidade. Nós não temos acesso a esses dados.

## Apagando seus dados

- Desconecte o Google Agenda ou remova tokens do GitHub e feeds em **Configurações**.
- Desinstale o app e apague `%APPDATA%\com.heyyczer.dynamicisland`.
- Desativar a integração com o Claude Code em **Configurações** restaura o seu `~/.claude/settings.json` anterior.

## Crianças

O app não é direcionado a menores de 13 anos e não coleta dados deles conscientemente.

## Alterações

Alterações nesta política são publicadas neste arquivo, com a data no topo atualizada. O histórico completo está no log de commits do repositório.

## Contato

Dúvidas ou pedidos: abra uma issue em [github.com/HeyyCzer/windows-dynamic-island/issues](https://github.com/HeyyCzer/windows-dynamic-island/issues).
