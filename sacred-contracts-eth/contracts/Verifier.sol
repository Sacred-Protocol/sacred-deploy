// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

library Pairing {
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return r the sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {
        uint256[4] memory input = [
            p1.X, p1.Y,
            p2.X, p2.Y
        ];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * @return r the product of a point on G1 and a scalar, i.e.
     *         p == p.scalarMul(1) and p.plus(p) == p.scalarMul(2) for all
     *         points p.
     */
    function scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input = [p.X, p.Y, s];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input = [
            a1.X, a1.Y, a2.X[0], a2.X[1], a2.Y[0], a2.Y[1],
            b1.X, b1.Y, b2.X[0], b2.X[1], b2.Y[0], b2.Y[1],
            c1.X, c1.Y, c2.X[0], c2.X[1], c2.Y[0], c2.Y[1],
            d1.X, d1.Y, d2.X[0], d2.X[1], d2.Y[0], d2.Y[1]
        ];
        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, input, mul(24, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-opcode-failed");
        return out[0] != 0;
    }
}

contract Verifier {
    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    using Pairing for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[7] IC;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(7097550961039555060991243995147555135732125613732364172514676306045271466904), uint256(20087005146250480919061301251243190387163862527621981645653195874284577969484));
        vk.beta2 = Pairing.G2Point([uint256(2835007687627164695101852632114416891345221756877619061898238999458194496287), uint256(16904011931375519134378989813938446464481840987721551882273412929143313734389)], [uint256(18785329793883294841968345682472008749494582539604306080454050005043975527655), uint256(7523164977644870450593265090088203899131775114372769855166455580049888044111)]);
        vk.gamma2 = Pairing.G2Point([uint256(13253061001198961101686381757924387582905798563547599903291208310877934665784), uint256(16256113357485163001949772780647636214409928091254671078629424394145931593046)], [uint256(18922174131658198236259916661640609525447042676515059248045532960945244059000), uint256(21297493936804882256466474650993870347710378645517935575209276241157965508593)]);
        vk.delta2 = Pairing.G2Point([uint256(3390688284574037465764423862854099081211929160164701199473365008543761311124), uint256(20746530029113783473503805914120554080710452885725151788021016203596011667589)], [uint256(5317521451223727717373667495848792244291079716961791609187535182069546457962), uint256(20273622418913184424277725623118894256659303190669538601789929535178556223563)]);
        vk.IC[0] = Pairing.G1Point(uint256(21506736608597350985619658398082193864387551909388717031440181405446433574469), uint256(2841669035419711074350012634446571880261617850474885438946880361122120296006));
        vk.IC[1] = Pairing.G1Point(uint256(19777773568557104805337691748043387312634675812813379151359257265758275950590), uint256(14223242100226226419393717691633801251456686436073826308295227679925980308009));
        vk.IC[2] = Pairing.G1Point(uint256(13937863093891479098609650200738675206287890393443757357157887068506759173891), uint256(8713357127068716575279890645601988118282152259519977309929001840303055294226));
        vk.IC[3] = Pairing.G1Point(uint256(18544005914783673657603205135938854339031429241225493875522509424105578951663), uint256(21103110352724095364835407291150571238587485367270165020318002423397381516843));
        vk.IC[4] = Pairing.G1Point(uint256(6743077221043694394976289522746486279616597865741779536145674372551444256534), uint256(14201405531898888616049410742708874531559956702517833773325709942676272405935));
        vk.IC[5] = Pairing.G1Point(uint256(15303279865880585895783200831623052572118385275126490917687163486051585775795), uint256(2703230866014618783192719018873487320891737523985812232566494095635916869133));
        vk.IC[6] = Pairing.G1Point(uint256(10539110399892381869260076443167537845710976772609738777062192295203867074357), uint256(261525020412969683849479271040352240155737301082395836458286925602684988372));

    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        bytes memory proof,
        uint256[6] memory input
    ) public view returns (bool) {
        uint256[8] memory p = abi.decode(proof, (uint256[8]));
        for (uint8 i = 0; i < p.length; i++) {
            // Make sure that each element in the proof is less than the prime q
            require(p[i] < PRIME_Q, "verifier-proof-element-gte-prime-q");
        }
        Pairing.G1Point memory proofA = Pairing.G1Point(p[0], p[1]);
        Pairing.G2Point memory proofB = Pairing.G2Point([p[2], p[3]], [p[4], p[5]]);
        Pairing.G1Point memory proofC = Pairing.G1Point(p[6], p[7]);

        VerifyingKey memory vk = verifyingKey();
        // Compute the linear combination vkX
        Pairing.G1Point memory vkX = vk.IC[0];
        for (uint256 i = 0; i < input.length; i++) {
            // Make sure that every input is less than the snark scalar field
            require(input[i] < SNARK_SCALAR_FIELD, "verifier-input-gte-snark-scalar-field");
            vkX = Pairing.plus(vkX, Pairing.scalarMul(vk.IC[i + 1], input[i]));
        }

        return Pairing.pairing(
            Pairing.negate(proofA),
            proofB,
            vk.alfa1,
            vk.beta2,
            vkX,
            vk.gamma2,
            proofC,
            vk.delta2
        );
    }
}

