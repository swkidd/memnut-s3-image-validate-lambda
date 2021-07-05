const aws = require('aws-sdk');
const fileType = require('file-type')
const { "v4": uuidv4 } = require('uuid');
const sharp = require('sharp');

const s3 = new aws.S3({ apiVersion: '2006-03-01' });

const dynamo = new aws.DynamoDB.DocumentClient();
const MARKER_DB = "memnut-markers"
const VALID_BUCKET = "memnut-valid-images"

const validType = type => type === "image/jpeg" || type === "image/png" || type === "image/webp"

exports.handler = async event => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  try {
    var params = {
      Bucket: bucket,
      Key: key,
      Range: "bytes=0-4100"
    };
    const { ContentType, Body, Metadata } = await s3.getObject(params).promise();

    const image_id = uuidv4()
    const markerid = Metadata.markerid
    const latlng = JSON.parse(Metadata.latlng)
    const creator = JSON.parse(Metadata.creator)

    const type = await fileType.fromBuffer(Body);
    if (!validType(ContentType) || !validType(type.mime)) {
      throw new Error('Invalid upload mime type');
    } else {

      var getparams = {
        Bucket: bucket,
        Key: key,
      }
      const raw_img = await s3.getobject(getparams).promise();

      const image_key = `${image_id}.webp`
      const image_key_md = `${image_id}_md.webp`
      const image_key_sm = `${image_id}_sm.webp`

      await s3.putObject({
        Bucket: VALID_BUCKET,
        Key: image_key,
        Body: await sharp(raw_img)
          .webp({ lossless: true })
          .toBuffer(),
        ContentType: 'image/webp'
      }).promise();

      await s3.putObject({
        Bucket: VALID_BUCKET,
        Key: image_key_md,
        Body: await sharp(raw_img)
          .resize(350, undefined, {
            fit: sharp.fit.cover,
          })
          .webp()
          .toBuffer(),
        ContentType: 'image/webp'
      }).promise();

      await s3.putObject({
        Bucket: VALID_BUCKET,
        Key: image_key_sm,
        Body: await sharp(raw_img)
          .resize(200, 200, {
            fit: sharp.fit.cover,
          })
          .webp()
          .toBuffer(),
        ContentType: 'image/webp'
      }).promise();


      const getResp = await dynamo
        .get({
          TableName: MARKER_DB,
          Key: {
            id: markerid
          }
        })
      .promise();

      if (getResp.Item) {
        const marker = getResp.Item
        const item = {
          ...marker,
          image_keys: [...marker.image_keys, image_key]
        }

        await dynamo
          .put({
            TableName: MARKER_DB,
            Item: item
          })
          .promise();
      } else {
        const item = {
          id: markerid,
          latlng,
          image_keys: [image_key],
          creator,
          email: key,
        }
        await dynamo
          .put({
            TableName: MARKER_DB,
            Item: item
          })
          .promise();
      }
    }
  }
  catch (err) {
    return "Error validating object"
  }
};