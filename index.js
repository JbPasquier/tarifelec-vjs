"use strict";
import {
  html,
  render,
} from "https://cdn.jsdelivr.net/npm/lit-element@3.2.2/+esm";

(async function () {
  async function getTempoRepository() {
    let repository =
      "https://raw.githubusercontent.com/grimmlink/tempo-comparatif/master/tempo.json";
    let values = await (await fetch(repository)).json();
    let mapping = {};
    for (let v of values.dates) {
      mapping[new Date(v.date).toDateString()] = v.couleur;
    }
    return mapping;
  }
  const TEMPO = await getTempoRepository();
  const TEMPO_PRICING = {
    false: {
      TEMPO_BLEU: 0.1369,
      TEMPO_BLANC: 0.1654,
      TEMPO_ROUGE: 0.7324,
    },
    true: {
      TEMPO_BLEU: 0.1056,
      TEMPO_BLANC: 0.1246,
      TEMPO_ROUGE: 0.1328,
    },
  };
  const BASE_PRICING = 0.2276;
  const TEMPO_SUBSCRIPTIONS = [
    [6, 12.8],
    [9, 16.0],
    [12, 19.29],
    [15, 22.3],
    [18, 25.29],
    [30, 38.13],
    [36, 44.28],
  ];
  const BASE_SUBSCRIPTIONS = [
    [3, 9.47],
    [6, 12.44],
    [9, 15.63],
    [12, 18.89],
    [15, 21.92],
    [18, 24.92],
    [24, 31.6],
    [30, 37.29],
    [36, 44.66],
  ];
  const footer = html`<hr />
    <section>
      <small style="text-align: center"
        >Cette
        <a href="https://github.com/JbPasquier/tarifelec-vjs"
          >version du simulateur</a
        >
        est réalisée en javascript et a lieu intégralement dans votre
        navigateur. Aucune donnée n'est envoyée.<br />Support ?
        <a href="https://discord.gg/DfVJZme">Discord Domotique & DIY</a> - Ping
        <b>@Nekotorep</b><br /><br /><a href="https://tarifelec.vraiment.top"
          >Consulter la version originale en PHP</a
        >
        par <b>@Frey-Mont</b></small
      >
    </section>`;
  class RawToEnergy {
    constructor(date, watts) {
      this.date = new Date(date);
      // tempoDate = date - 8h // isHC if >=16h && <00h.
      this.tempoDate = new Date(this.date.getTime() - 21600000);
      this.tempo = TEMPO[this.tempoDate.toDateString()];
      this.isHC = this.tempoDate.getHours() > 15;
      this.watts = Number(watts);
      this.interval = 60;
      this.compile();
    }
    defineInterval(previous) {
      this.interval = Math.abs(Math.floor((this.date - previous) / 1000)) / 60;
      this.compile();
    }
    setInterval(interval) {
      this.interval = interval;
    }
    compile() {
      this.tempoCost = this.tokWh() * TEMPO_PRICING[this.isHC][this.tempo];
      this.baseCost = this.tokWh() * BASE_PRICING;
      this.wH = this.toWh();
    }
    tokWh() {
      return this.toWh() / 1000;
    }
    toWh() {
      return (this.watts / 60) * this.interval;
    }
  }
  class ValuesToMeta {
    constructor({ clientParams, values }) {
      this.pdl = clientParams[0];
      this.start = clientParams[2];
      this.end = clientParams[3];
      this.values = values
        .filter((v) => v.length == 2 && v[1] != "")
        .map((v) => new RawToEnergy(v[0], v[1]));
      // Define interval for each line based on the previous one
      this.values.reduce((acc, v) => {
        v.defineInterval(acc.date);
        return v;
      });
      // Ensure interval of first entry from midnight
      let d = this.values[0].date;
      this.values[0].setInterval(
        (d.getTime() -
          new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)) /
          1000 /
          60
      );
      // Get total subscription monthes
      this.startDate = this.values[0].date;
      this.endDate = this.values[this.values.length - 1].date;
      this.monthes =
        (this.endDate.getFullYear() - this.startDate.getFullYear()) * 12 +
        (this.endDate.getMonth() - this.startDate.getMonth() + 1);
      // Max power
      this.maxkVa =
        this.values.reduce((acc, v) => (v.wH > acc.wH ? v : acc)).wH / 1000;
      // Compile base datas
      this.base = {
        cost: this.values.reduce((acc, v) => v.baseCost + acc, 0),
        Wh: this.values.reduce((acc, v) => v.toWh() + acc, 0),
        subscription:
          this.monthes *
          BASE_SUBSCRIPTIONS.filter((v) => v[0] >= this.maxkVa)[0][1],
        subscriptionkVa: BASE_SUBSCRIPTIONS.filter(
          (v) => v[0] >= this.maxkVa
        )[0][0],
      };
      this.base.totalCost = Number(this.base.cost + this.base.subscription);
      // Compile Tempo datas
      this.tempo = {
        cost: this.values.reduce(
          (acc, v) => (v.tempoCost ? v.tempoCost + acc : acc),
          0
        ),
        red: {
          hp: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_ROUGE" && !v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_ROUGE" && !v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          hc: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_ROUGE" && v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_ROUGE" && v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          cost: this.values
            .filter((v) => v.tempo == "TEMPO_ROUGE")
            .reduce((acc, v) => v.tempoCost + acc, 0),
          Wh: this.values
            .filter((v) => v.tempo == "TEMPO_ROUGE")
            .reduce((acc, v) => v.toWh() + acc, 0),
        },
        white: {
          hp: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_BLANC" && !v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_BLANC" && !v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          hc: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_BLANC" && v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_BLANC" && v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          cost: this.values
            .filter((v) => v.tempo == "TEMPO_BLANC")
            .reduce((acc, v) => v.tempoCost + acc, 0),
          Wh: this.values
            .filter((v) => v.tempo == "TEMPO_BLANC")
            .reduce((acc, v) => v.toWh() + acc, 0),
        },
        blue: {
          hp: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_BLEU" && !v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_BLEU" && !v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          hc: {
            cost: this.values
              .filter((v) => v.tempo == "TEMPO_BLEU" && v.isHC)
              .reduce((acc, v) => v.tempoCost + acc, 0),
            Wh: this.values
              .filter((v) => v.tempo == "TEMPO_BLEU" && v.isHC)
              .reduce((acc, v) => v.toWh() + acc, 0),
          },
          cost: this.values
            .filter((v) => v.tempo == "TEMPO_BLEU")
            .reduce((acc, v) => v.tempoCost + acc, 0),
          Wh: this.values
            .filter((v) => v.tempo == "TEMPO_BLEU")
            .reduce((acc, v) => v.toWh() + acc, 0),
        },
        Wh: this.values.reduce((acc, v) => v.toWh() + acc, 0),
        subscription:
          this.monthes *
          TEMPO_SUBSCRIPTIONS.filter((v) => v[0] >= this.maxkVa)[0][1],
        subscriptionkVa: TEMPO_SUBSCRIPTIONS.filter(
          (v) => v[0] >= this.maxkVa
        )[0][0],
        errors: this.values.filter((v) => !v.tempo).length,
      };
      this.tempo.totalCost = Number(this.tempo.cost + this.tempo.subscription);
    }
    tokWh(value) {
      return value / 1000;
    }
  }
  render(
    html` <article>
        <h2>Fichier exporté depuis Enedis, non-modifié :</h2>
        <input type="file" id="csvfile" />
      </article>
      ${footer}`,
    document.querySelector("#content")
  );
  const fileInput = document.querySelector("#csvfile");
  fileInput.addEventListener("change", () => {
    Papa.parse(fileInput.files[0], {
      complete: function (result) {
        if (result.errors.length > 0 || result.meta.aborted) {
          console.error(result.errors);
        } else {
          let values = result.data;
          values.shift();
          let clientParams = values.shift();
          values.shift();
          let meta = new ValuesToMeta({ clientParams, values });
          render(
            html`
              <article>
                <aside>
                  <h3>Simulation</h3>
                  <details>
                    <summary>Afficher PDL</summary>
                    <p>${meta.pdl}</p>
                  </details>
                  <p>
                    Entre le ${meta.start} et le ${meta.end}, soit
                    <b>${meta.monthes} mois d'abonnement</b>.
                  </p>
                  <p>
                    Conso totale:
                    <b>${meta.tokWh(meta.base.Wh).toFixed(2)} kWh</b>, puissance
                    maximale atteinte de <b>${meta.maxkVa} kVA</b>.
                  </p>
                  <hr />
                  <h3>En Tarif Bleu</h3>
                  <p>
                    Option Base<sup>${meta.base.subscriptionkVa} kVA</sup> ça
                    aurait coûté
                    <strong>${meta.base.totalCost.toFixed(2)}€</strong> dont
                    ${meta.base.cost.toFixed(2)}€ de consommation et
                    ${meta.base.subscription.toFixed(2)}€ d'abonnement
                  </p>
                  <p>
                    Option Tempo<sup>${meta.tempo.subscriptionkVa} kVA</sup> ça
                    aurait coûté
                    <strong>${meta.tempo.totalCost.toFixed(2)}€</strong> dont
                    ${meta.tempo.cost.toFixed(2)}€ de consommation et
                    ${meta.tempo.subscription.toFixed(2)}€ d'abonnement
                  </p>
                  <hr />
                  <h4>Répartition Tempo</h4>
                  <p>
                    Jours rouges: ${meta.tempo.red.cost.toFixed(2)}€ pour
                    ${meta.tokWh(meta.tempo.red.Wh).toFixed(2)} kWh, dont
                    ${meta.tempo.red.hp.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.red.hp.Wh).toFixed(2)} kWh) en
                    heures pleines et ${meta.tempo.red.hc.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.red.hc.Wh).toFixed(2)} kWh) en
                    heures creuses.
                  </p>
                  <p>
                    Jours blancs: ${meta.tempo.white.cost.toFixed(2)}€ pour
                    ${meta.tokWh(meta.tempo.white.Wh).toFixed(2)} kWh, dont
                    ${meta.tempo.white.hp.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.white.hp.Wh).toFixed(2)} kWh) en
                    heures pleines et ${meta.tempo.white.hc.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.white.hc.Wh).toFixed(2)} kWh) en
                    heures creuses.
                  </p>
                  <p>
                    Jours bleus: ${meta.tempo.blue.cost.toFixed(2)}€ pour
                    ${meta.tokWh(meta.tempo.blue.Wh).toFixed(2)} kWh, dont
                    ${meta.tempo.blue.hp.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.blue.hp.Wh).toFixed(2)} kWh) en
                    heures pleines et ${meta.tempo.blue.hc.cost.toFixed(2)}€
                    (${meta.tokWh(meta.tempo.blue.hc.Wh).toFixed(2)} kWh) en
                    heures creuses.
                  </p>
                  <hr />
                  <details open>
                    <summary>Graphique interactif</summary>
                    <p id="chart" style="height: 500px; width: 100%;"></p>
                  </details>
                </aside>
              </article>
              ${meta.tempo.errors > 0
                ? html`<article>
                    <aside>
                      <p>
                        Erreurs:
                        <b style="color:red;"
                          >${meta.tempo.errors} entrées avec couleur inconnue</b
                        >
                        pour le calcul Tempo, ping <b>@Frey-Mont</b> !
                      </p>
                    </aside>
                  </article>`
                : ""}
              ${footer}
            `,
            document.querySelector("#content")
          );
          let chart = new CanvasJS.Chart("chart", {
            backgroundColor: "transparent",
            animationEnabled: true,
            zoomEnabled: true,
            title: {
              text: "",
            },
            axisX: {
              gridThickness: 1,
              interval: 1,
              intervalType: "hour",
              valueFormatString: "DD-MM-YYYY HH:mm",
              labelFormatter: () => "",
            },
            axisY: {
              title: "Wh",
              includeZero: false,
            },
            data: [
              {
                type: "line",
                dataPoints: meta.values.map((v) => ({ x: v.date, y: v.wH })),
              },
            ],
          });
          chart.render();
          console.log(meta);
        }
      },
    });
  });
})();
