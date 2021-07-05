zip -r function.zip .
aws lambda update-function-code --region ap-northeast-1 --function-name memnut-s3-image-validate-lambda --zip-file fileb://function.zip