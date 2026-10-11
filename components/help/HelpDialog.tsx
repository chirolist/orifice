"use client";

import { useSimulationStore } from "@/hooks/useSimulationStore";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "何を解いているか",
    body: [
      "解析モデルは、トリチェリの定理、半平面シンク、一定幅の放物噴流をつないだ速度場です。ナビエ・ストークス方程式の解ではありません。",
      "数値モデルは、2次元・非圧縮のナビエ・ストークス方程式をスタガード格子の射影法で解きます。移流、粘性、重力、圧力ポアソン方程式、速度の修正、境界条件の順です。",
      "水面の形は水平線のままです。波、砕波、VOF、Level Set、SPH は未実装です。水位は貯水池の水平断面積と流入・流出から更新します。",
    ],
  },
  {
    title: "理論式",
    body: [
      "理想流速は v = √(2gh) です。h は水面からオリフィス中心、または部分水没では水没部の重心までの深さです。",
      "理論流量は Q = C_d A √(2gh) です。C_d は形状と流れで変わる流出係数で、普遍定数ではありません。",
      "水位は A dh/dt = Qin − Qout です。A は貯水池の長さ×奥行きです。",
      "粘性係数と動粘度は ν = μ / ρ で結び、別々の独立な物性としては扱いません。",
    ],
  },
  {
    title: "理論値と数値解が違うとき",
    body: [
      "解析モードでは出口速度を C_d√(2gh) で与えるため、流量が理論流量に近いことは独立な検証になりません。",
      "数値モードは静止状態から加速します。準定常のトリチェリ流量へすぐに一致するとは限りません。",
      "差の要因は、過渡状態、粘性、2次元であること、格子の粗さ、セミラグランジュ法の数値拡散、出口境界、円形開口を2次元流速で換算していることです。",
      "発散誤差と壁面法線速度は、非圧縮条件と境界の数値誤差を見るための量です。",
    ],
  },
  {
    title: "粒子と乱流",
    body: [
      "粒子は速度場を補間して進むトレーサーです。粒子の個数は水の質量ではありません。積分はオイラー法、2次または4次のルンゲ・クッタから選べます。",
      "自由放出では、ダムの外に出た粒子だけを重力で落下させます。この落下は下流の数値解ではありません。",
      "レイノルズ数は流れが層流か乱流かの判定そのものではありません。オリフィス噴流の遷移は形状、入口の乱れ、自由せん断層にも依存します。",
      "Smagorinsky 型は2次元の渦粘性近似です。RANS でも、3次元乱流の直接数値計算でもありません。描画だけの擾乱は速度場に入っていません。",
    ],
  },
  {
    title: "無次元数と未実装",
    body: [
      "レイノルズ数 Re = UL/ν、フルード数 Fr = U/√(gL)、ウェーバー数 We = ρU²L/σ です。L は水力直径です。",
      "オイラー数は Eu = Δp/(ρU²)、Δp = ρgh です。分母を ½ρU² にする定義では、理想的なトリチェリ流れで 1 になります。",
      "キャビテーション数は絶対圧力と蒸気圧から計算する参考値です。ゲージ圧が負というだけではキャビテーションとしません。相変化は解いていません。",
      "表面張力はウェーバー数だけに使い、界面力としては入っていません。縮流の3次元効果、水温の分布、k-ε モデルも未実装です。",
    ],
  },
  {
    title: "操作",
    body: [
      "開始と一時停止は流体場を保持します。リセットは今のパラメータで場・粒子・グラフを初期化します。初期状態に戻すは、起動時または最後に適用したプリセットへ戻します。",
      "描画は requestAnimationFrame、流体計算は Web Worker です。タブを隠すと計算を止め、表示を戻したときに時間を飛ばして追いかけません。",
      "計算が発散すると停止します。時間刻みを小さくするか、粘性と解像度を見直してリセットしてください。",
    ],
  },
];

export function HelpDialog() {
  const open = useSimulationStore((state) => state.helpOpen);
  const setHelpOpen = useSimulationStore((state) => state.setHelpOpen);
  if (!open) return null;
  return (
    <div className="help-backdrop" role="presentation" onClick={() => setHelpOpen(false)}>
      <article className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2 id="help-title">物理モデルの解説</h2>
          <button type="button" onClick={() => setHelpOpen(false)}>閉じる</button>
        </header>
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </article>
    </div>
  );
}
