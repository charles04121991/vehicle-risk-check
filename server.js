const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

/*
========================================
允許前端跨網域呼叫 API
之後 GitHub Pages 會呼叫這個後端
========================================
*/

app.use((req, res, next) => {

  res.header(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  next();

});


/*
========================================
首頁測試
========================================
*/

app.get("/", (req, res) => {

  res.json({

    success: true,

    message:
      "車輛風險查詢 API 正常運作"

  });

});


/*
========================================
失竊車輛／車牌查詢 API

使用方式：

/api/vehicle?type=A&plate=ABC-1234

type:
A = 汽車
B = 重機車
C = 輕機車
S = 微電車
T = 拖車
G = 動力機械車
TEMP = 臨時牌
R = 試車牌
========================================
*/

app.get(
  "/api/vehicle",

  async (req, res) => {

    try {

      /*
      取得參數
      */

      const type =
        String(
          req.query.type || ""
        )
        .trim()
        .toUpperCase();


      const plate =
        String(
          req.query.plate || ""
        )
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");


      /*
      檢查是否輸入
      */

      if (!type || !plate) {

        return res.status(400).json({

          success: false,

          message:
            "請提供牌照種類與車牌號碼"

        });

      }


      /*
      限制合法牌照種類
      */

      const allowedTypes = [

        "A",
        "B",
        "C",
        "S",
        "T",
        "G",
        "TEMP",
        "R"

      ];


      if (
        !allowedTypes.includes(type)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "不支援的牌照種類"

        });

      }


      /*
      建立警政署官方查詢網址
      */

      const params =
        new URLSearchParams({

          vehType: type,

          vehNumber: plate

        });


      const officialUrl =

        "https://eze8.npa.gov.tw" +

        "/E82OpendataWebE/veh/query_veh?" +

        params.toString();


      /*
      向官方資料來源查詢
      */

      const response =
        await fetch(
          officialUrl,
          {

            method: "GET",

            headers: {

              "User-Agent":
                "Vehicle-Risk-Check/1.0",

              "Accept":
                "text/csv,text/plain,*/*"

            }

          }
        );


      /*
      官方服務錯誤
      */

      if (!response.ok) {

        throw new Error(

          "官方資料服務回應錯誤：" +

          response.status

        );

      }


      /*
      取得 CSV 原始內容
      */

      const csv =
        await response.text();


      /*
      暫時回傳原始資料

      下一階段我們再把 CSV
      解析成漂亮的 JSON
      */

      return res.json({

        success: true,

        query: {

          vehicleType: type,

          plateNumber: plate

        },

        source:
          "內政部警政署公開資料服務",

        queriedAt:
          new Date().toISOString(),

        rawData:
          csv

      });


    }

    catch (error) {

      console.error(
        "Vehicle query error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "目前無法完成官方資料查詢",

        error:
          error.message

      });

    }

  }

);


/*
========================================
啟動 Server
========================================
*/

app.listen(
  PORT,
  () => {

    console.log(

      `Vehicle Risk API running on port ${PORT}`

    );

  }
);
