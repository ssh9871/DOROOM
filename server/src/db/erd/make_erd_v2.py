"""DB 실제 스키마에서 FK를 읽어 Graphviz ERD를 그린다 (명세와 그림이 어긋나지 않게)."""
import subprocess, sys, json

OUT = sys.argv[1]

def q(sql):
    r = subprocess.run(["psql", "-h", "/tmp", "-U", "postgres", "-d", "doroom2", "-AtF", "\t", "-c", sql],
                       capture_output=True, text=True, check=True)
    return [l.split("\t") for l in r.stdout.strip().splitlines() if l]

MVP = ["app_user","cell_transaction","user_title","title","reward_mail","pet_grade_rule","pet_evolution_rule","pet_species","ability","user_pet","pet_exp_transfer","item","user_item","pet_interaction_log","equipment","user_equipment","user_pet_equipment","stat_upgrade_rule","user_stat_upgrade","gacha_pool","gacha_pool_entry","gacha_log","stage","game_run","user_stage_clear","game_setting"]
EXT = []

KO = {"app_user":"회원","cell_transaction":"셀 내역","user_title":"보유 칭호","title":"칭호","reward_mail":"우편 보상",
      "pet_grade_rule":"등급 규칙","pet_evolution_rule":"진화 규칙","pet_species":"펫 종류","ability":"능력","user_pet":"보유 펫",
      "pet_exp_transfer":"경험치 전승","item":"아이템","user_item":"인벤토리","pet_interaction_log":"돌봄 기록",
      "equipment":"장비","user_equipment":"보유 장비","user_pet_equipment":"펫 장착","stat_upgrade_rule":"스탯 강화 규칙","user_stat_upgrade":"스탯 강화",
      "gacha_pool":"뽑기 풀","gacha_pool_entry":"뽑기 구성","gacha_log":"뽑기 기록","stage":"스테이지","game_run":"게임 기록",
      "user_stage_clear":"스테이지 클리어","game_setting":"운영 설정"}

# 도메인 색 (기준 데이터는 회색 계열 헤더)
DOMAIN = {
 "회원·재화·칭호": (["app_user","cell_transaction","reward_mail","title","user_title"], "#2F6690"),
 "펫": (["pet_grade_rule","pet_evolution_rule","pet_species","ability","user_pet","pet_exp_transfer"], "#3A7D44"),
 "돌봄·아이템": (["item","user_item","pet_interaction_log"], "#B5651D"),
 "장비·강화": (["equipment","user_equipment","user_pet_equipment","stat_upgrade_rule","user_stat_upgrade"], "#7B4B94"),
 "뽑기": (["gacha_pool","gacha_pool_entry","gacha_log"], "#C2185B"),
 "게임·랭킹": (["stage","game_run","user_stage_clear"], "#A23B3B"),
 "설정": (["game_setting"], "#666666"),
}
COLOR = {t: c for _, (ts, c) in DOMAIN.items() for t in ts}
MASTER = {"ability","pet_species","pet_grade_rule","pet_evolution_rule","item","equipment","stat_upgrade_rule","gacha_pool","gacha_pool_entry","stage","title","game_setting"}

cols = q("""select c.table_name, c.column_name, c.data_type, c.is_nullable
            from information_schema.columns c where table_schema='public' order by table_name, ordinal_position""")
pks = {(t, c) for t, c in q("""select tc.table_name, kcu.column_name from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu using (constraint_schema, constraint_name)
            where tc.constraint_type='PRIMARY KEY' and tc.table_schema='public'""")}
fks = q("""select cl.relname, a.attname, fcl.relname, c.conname
           from pg_constraint c join pg_class cl on cl.oid=c.conrelid
           join pg_class fcl on fcl.oid=c.confrelid
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
           where c.contype='f' order by 1,2""")
fkcols = {(t, c) for t, c, _, _ in fks}
nullable = {(t, c): n == "YES" for t, c, _, n in cols}
uniq_pairs = {tuple(r) for r in q("""select cl.relname, a.attname from pg_index i join pg_class cl on cl.oid=i.indrelid
           join pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
           where i.indisunique and i.indpred is null and array_length(i.indkey::int[],1)=1 and not i.indisprimary""")}

TYPE = {"integer":"int","bigint":"bigint","smallint":"smallint","character varying":"varchar","boolean":"bool",
        "timestamp with time zone":"timestamptz","date":"date","numeric":"numeric","jsonb":"jsonb"}

FKTARGET = {(t, c): ft for t, c, ft, _ in fks}

def node(t, detail, tables=()):
    color = COLOR[t]
    tag = " · 기준" if t in MASTER else ""
    head = (f'<TR><TD BGCOLOR="{color}" ALIGN="LEFT" COLSPAN="3"><FONT COLOR="white"><B>{t}</B>'
            f'  {KO[t]}{tag}</FONT></TD></TR>')
    rows = ""
    if detail:
        for tt, c, dt, _ in cols:
            if tt != t: continue
            if (t, c) in FKTARGET and FKTARGET[(t, c)] not in tables: continue
            k = []
            if (t, c) in pks: k.append("PK")
            if (t, c) in fkcols: k.append("FK")
            if (t, c) in uniq_pairs: k.append("UK")
            key = ",".join(k) or " "
            name = f"<B>{c}</B>" if (t, c) in pks else c
            rows += (f'<TR><TD ALIGN="LEFT" PORT="{c}">{name}</TD><TD ALIGN="LEFT"><FONT COLOR="#555555">'
                     f'{TYPE.get(dt, dt)}</FONT></TD><TD ALIGN="LEFT"><FONT COLOR="#A23B3B">{key}</FONT></TD></TR>')
    return (f'"{t}" [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" BGCOLOR="white">'
            f'{head}{rows}</TABLE>>];')

def graph(tables, detail, name, rankdir="LR"):
    s = [f'digraph G {{ graph [rankdir={rankdir}, splines=true, nodesep=0.35, ranksep=0.9, pad=0.3, bgcolor="white", fontname="Noto Sans CJK KR"];',
         'node [shape=plaintext, fontname="Noto Sans CJK KR", fontsize=11];',
         'edge [fontname="Noto Sans CJK KR", fontsize=9, color="#777777", arrowsize=0.7];']
    placed = set()
    for i, (dname, (ts, color)) in enumerate(DOMAIN.items()):
        members = [t for t in ts if t in tables]
        if not members: continue
        s.append(f'subgraph cluster_{i} {{ label="{dname}"; fontsize=14; fontcolor="{color}"; '
                 f'style="rounded,dashed"; color="{color}"; margin=14;')
        for t in members:
            s.append(node(t, detail, tables)); placed.add(t)
        s.append("}")
    for t in tables:
        if t not in placed: s.append(node(t, detail, tables))
    seen = set()
    for t, c, ft, _ in fks:
        if t in tables and ft in tables:
            if not detail and (t, ft) in seen: continue
            seen.add((t, ft))
            # 자식(N) -> 부모(1). 부모 쪽 tee, 자식 쪽 crow
            opt = nullable.get((t, c), False)
            tail = "crowodot"
            head = "teeodot" if opt else "teetee"
            lab = f' label="{c}"' if detail else ""
            s.append(f'"{ft}" -> "{t}" [dir=both, arrowtail={head}, arrowhead={tail}{lab}];')
    s.append("}")
    path = f"{OUT}/{name}"
    open(path + ".dot", "w").write("\n".join(s))
    subprocess.run(["dot", "-Tpng", "-Gdpi=170", path + ".dot", "-o", path + ".png"], check=True)
    subprocess.run(["dot", "-Tsvg", path + ".dot", "-o", path + ".svg"], check=True)

graph([t for t in MVP if t != "game_setting"], False, "ERD_v2_1_발표용_전체관계도")
graph(MVP, True, "ERD_v2_2_상세")
print("done")
