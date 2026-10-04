# Integração TSE — dados oficiais em tempo real

O painel consome os JSON oficiais do TSE via `server/proxy.mjs`, que normaliza
para o modelo `ElectionDataset`.

## Ambiente oficial (padrão)

- Base: `https://resultados.tse.jus.br/oficial`
- 1º turno 04/10/2026:
  - Federal (Presidente): eleição `6257` (2º turno `6258`)
  - Estaduais: eleição `6259` (2º turno `6260`)

Arquivo de votos/nomes (EA20 unificado):

```text
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json
```

Acompanhamento de seções (EA15, sem votos por candidato):

```text
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-e006257-ab.json
```

Documentação: [Informações técnicas — divulgação de resultados 2026](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados).

Limite oficial: até 100 requisições/IP/segundo.

## Como subir

```bash
# Terminal 1 — proxy apontando ao TSE oficial
pnpm proxy

# Terminal 2 — frontend (Vite encaminha /results → :8787)
pnpm dev
```

Abra `http://127.0.0.1:8443/`.

Atualização automática no painel: a cada **5 segundos** (refresh silencioso).
Cache do proxy: **5 segundos**.

## Simulado (opcional)

```bash
pnpm proxy:sim
```

## Cargos mapeados

| Cargo | Eleição oficial | Código cargo |
|---|---|---|
| Presidente | 6257 | 0001 |
| Governador | 6259 | 0003 |
| Senador | 6259 | 0005 |
| Deputado Federal | 6259 | 0006 |
| Deputado Estadual | 6259 | 0007 |
