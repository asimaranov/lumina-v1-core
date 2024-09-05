import {
    Cache,
} from "o1js";

export const fetchFiles = async () => {
    let currentLocation = self.location.origin;
    var headers = new Headers();
    headers.append('Content-Encoding', 'br, gzip, deflate');

    const filesResponse = await fetch(`${currentLocation}/compiled.json`, { headers });
    const json = await filesResponse.json();
    return Promise.all(json.map((file) => {
        return Promise.all([
            fetch(`${currentLocation}/cache/${file}.txt`, {
                cache: "force-cache",
                headers
            }).then(res => res.text())
        ]).then(([data]) => ({ file, data }));
    }))
        .then((cacheList) => cacheList.reduce((acc: any, { file, data }) => {
            acc[file] = { file, data };

            return acc;
        }, {}));
}

export const readCache = (files: any): Cache => ({
    read({ persistentId, uniqueId, dataType }: any) {
        // read current uniqueId, return data if it matches
        if (!files[persistentId]) {
            return undefined;
        }

        if (dataType === 'string') {
            return new TextEncoder().encode(files[persistentId].data);
        }
        // else {
        //   let buffer = readFileSync(resolve(cacheDirectory, persistentId));
        //   return new Uint8Array(buffer.buffer);
        // }

        return undefined;
    },
    write({ persistentId, uniqueId, dataType }: any, data: any) {
        console.log('write');
        console.log({ persistentId, uniqueId, dataType });
    },
    canWrite: false,
});