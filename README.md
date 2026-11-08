# Batalha Turbo Online 🎮
Jogo de combate em tempo real para telemóveis Android e navegadores, com salas privadas (até 6 jogadores).

## Estado
O serviço Render publica a interface e o servidor WebSocket. Em Android, o Chrome permite instalar a aplicação web no ecrã principal; o projeto Android também permite criar um APK de teste.

## Código
Para facilitar a transferência inicial do projeto, os ficheiros de origem estão no pacote comprimido `batalha_payload.txt`. O script `unpack.js` extrai os ficheiros de origem e as imagens. Não precisa de bibliotecas externas.

## Desenvolvimento
```bash
node unpack.js
npm test
npm start
```
Acede a http://localhost:3000/ e experimenta criar uma sala privada.

## Render
Runtime Node, build `node unpack.js && npm install --omit=dev`, start `npm start`. A rota `/health` indica se o jogo está online.
Os planos gratuitos do Render podem entrar em suspensão por inatividade.

## APK de teste
O fluxo GitHub Actions **Gerar APK Android** compila um APK que abre o jogo através do WebView Android.
O jogo depende do servidor online e de Internet. A assinatura é de testes/debug, não adequada para a Play Store.
