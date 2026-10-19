# data

- `past-exams/`（論文式）と `tanto/`（短答式）の `shihou/`・`yobi/` は、法務省ウェブサイトで公表されている司法試験・予備試験の問題・出題趣旨・採点実感・正解表の PDF をテキスト化し、整形したものです。
  出典：法務省ウェブサイト（各ファイルの `sourceUrl` の URL）を加工して作成。公共データ利用規約（第1.0版）（https://www.moj.go.jp/hisho06_00280.html ）に基づいて利用しています。
- `sample/` は動作確認用の架空のデータです（`SEED_SAMPLES=1` のときだけ DB に入ります）。
- 作り方は `scripts/moj/README.md` を見てください。
